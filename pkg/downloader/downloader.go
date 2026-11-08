package downloader

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/faisalfa123/Senandung/pkg/db"
	"github.com/faisalfa123/Senandung/pkg/models"
)

type Queue struct {
	db          *db.DB
	musicDir    string
	coverDir    string
	jobChan     chan *models.DownloadJob
	jobsMu      sync.RWMutex
	jobs        map[string]*models.DownloadJob
	ytDlpBinary string
	ffmpegPath  string
}

func NewQueue(database *db.DB, musicDir, coverDir string) *Queue {
	_ = os.MkdirAll(musicDir, 0755)
	_ = os.MkdirAll(coverDir, 0755)

	ytDlp := "yt-dlp"
	if p, err := exec.LookPath("yt-dlp"); err == nil {
		ytDlp = p
	} else if _, err := os.Stat("/usr/local/bin/yt-dlp"); err == nil {
		ytDlp = "/usr/local/bin/yt-dlp"
	}

	ffmpeg := "ffmpeg"
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		ffmpeg = p
	}

	q := &Queue{
		db:          database,
		musicDir:    musicDir,
		coverDir:    coverDir,
		jobChan:     make(chan *models.DownloadJob, 50),
		jobs:        make(map[string]*models.DownloadJob),
		ytDlpBinary: ytDlp,
		ffmpegPath:  ffmpeg,
	}

	go q.worker()

	return q
}

func (q *Queue) AddJob(query, format string) *models.DownloadJob {
	return q.AddJobWithTitle(query, query, format)
}

func (q *Queue) AddJobWithTitle(query, displayTitle, format string) *models.DownloadJob {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()

	cleanFormat := strings.ToLower(strings.TrimSpace(format))
	if cleanFormat != "flac" {
		cleanFormat = "mp3"
	}

	job := &models.DownloadJob{
		ID:       fmt.Sprintf("job_%d", time.Now().UnixNano()),
		Query:    strings.TrimSpace(query),
		Title:    strings.TrimSpace(displayTitle),
		Format:   cleanFormat,
		Status:   "pending",
		Percent:  0,
		Speed:    "-",
		ETA:      "Antrean...",
		Progress: "Menunggu giliran di STB...",
	}
	q.jobs[job.ID] = job
	q.jobChan <- job
	return job
}

func (q *Queue) GetJobs() []*models.DownloadJob {
	q.jobsMu.RLock()
	defer q.jobsMu.RUnlock()

	var list []*models.DownloadJob
	for _, j := range q.jobs {
		list = append(list, j)
	}
	return list
}

func (q *Queue) worker() {
	for job := range q.jobChan {
		q.processJob(job)
	}
}

func (q *Queue) processJob(job *models.DownloadJob) {
	q.updateJobProgress(job.ID, "downloading", 2, "Menghubungkan ke sumber audio...", "-", "Memulai...")

	outputTemplate := filepath.Join(q.musicDir, "%(title)s [%(id)s].%(ext)s")

	isFlac := job.Format == "flac"
	audioFormat := "mp3"
	audioQuality := "320K"
	if isFlac {
		audioFormat = "flac"
		audioQuality = "0"
	}

	// Gunakan yt-dlp dengan output unbuffered newline agar progress bisa diparse secara live
	// Hindari --embed-thumbnail yang bisa gagal pada beberapa versi ffmpeg tanpa atomicparsley
	args := []string{
		"-x",
		"--audio-format", audioFormat,
		"--audio-quality", audioQuality,
		"--add-metadata",
		"--output", outputTemplate,
		"--newline",
		"--no-playlist",
		"--no-warnings",
	}

	target := job.Query
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		// Jika Video ID 11 digit karakter (cth CTkdmwOYUpg), download URL langsung
		if len(target) == 11 && !strings.Contains(target, " ") {
			target = "https://www.youtube.com/watch?v=" + target
		} else {
			target = "ytsearch1:" + target
		}
	}
	args = append(args, target)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, q.ytDlpBinary, args...)
	if _, err := exec.LookPath("nice"); err == nil {
		niceArgs := append([]string{"-n", "19", q.ytDlpBinary}, args...)
		cmd = exec.CommandContext(ctx, "nice", niceArgs...)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		q.setJobError(job.ID, fmt.Sprintf("Gagal inisialisasi stdout pipe: %v", err))
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		q.setJobError(job.ID, fmt.Sprintf("Gagal menjalankan yt-dlp: %v (Pastikan yt-dlp & ffmpeg terpasang)", err))
		return
	}

	// Regex parser untuk progress asli yt-dlp:
	// [download]  45.2% of ~ 4.12MiB at    1.25MiB/s ETA 00:02
	rePercent := regexp.MustCompile(`\[download\]\s+([\d\.]+)%`)
	reSpeed := regexp.MustCompile(`at\s+([^\s]+)`)
	reETA := regexp.MustCompile(`ETA\s+([^\s]+)`)
	reDest := regexp.MustCompile(`\[(?:ExtractAudio|ffmpeg|download)\] Destination:\s+(.+)`)

	scanner := bufio.NewScanner(stdout)
	var lastDestination string
	var lastErrLine string

	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "ERROR:") {
			lastErrLine = strings.TrimSpace(line)
		}

		if m := rePercent.FindStringSubmatch(line); len(m) > 1 {
			if p, err := strconv.ParseFloat(m[1], 64); err == nil {
				intP := int(p)
				if intP > 95 {
					intP = 95 // Tunggu sampai konversi ffmpeg selesai untuk 100%
				}

				speed := "-"
				if sm := reSpeed.FindStringSubmatch(line); len(sm) > 1 {
					speed = sm[1]
				}

				eta := "-"
				if em := reETA.FindStringSubmatch(line); len(em) > 1 {
					eta = em[1]
				}

				q.updateJobProgress(job.ID, "downloading", intP, fmt.Sprintf("Mengunduh... %d%%", intP), speed, eta)
			}
		} else if strings.Contains(line, "[ExtractAudio]") || strings.Contains(line, "[ffmpeg]") {
			q.updateJobProgress(job.ID, "downloading", 96, "Mengonversi audio & menyematkan metadata...", "-", "Sesaat lagi...")
			if dm := reDest.FindStringSubmatch(line); len(dm) > 1 {
				lastDestination = strings.TrimSpace(dm[1])
			}
		} else if dm := reDest.FindStringSubmatch(line); len(dm) > 1 {
			lastDestination = strings.TrimSpace(dm[1])
		}
	}

	if err := cmd.Wait(); err != nil {
		log.Printf("[Downloader] yt-dlp exit with error: %v (%s)", err, lastErrLine)
		errDetail := fmt.Sprintf("yt-dlp gagal: %v", err)
		if lastErrLine != "" {
			errDetail = lastErrLine
		}
		q.setJobError(job.ID, errDetail)
		return
	}

	// Ekstrak metadata file hasil unduhan
	var finalFilePath string
	var coverURL string

	if lastDestination != "" && fileExists(lastDestination) {
		finalFilePath = lastDestination
	} else {
		// Cari file audio terbaru di folder musik
		entries, _ := os.ReadDir(q.musicDir)
		var newestTime time.Time
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext == ".flac" || ext == ".mp3" || ext == ".m4a" || ext == ".opus" || ext == ".wav" {
				info, err := entry.Info()
				if err == nil && info.ModTime().After(newestTime) {
					newestTime = info.ModTime()
					finalFilePath = filepath.Join(q.musicDir, entry.Name())
				}
			} else if ext == ".jpg" || ext == ".webp" || ext == ".png" {
				coverDest := filepath.Join(q.coverDir, entry.Name())
				_ = os.Rename(filepath.Join(q.musicDir, entry.Name()), coverDest)
				coverURL = "/api/covers/" + entry.Name()
			}
		}
	}

	if finalFilePath == "" {
		q.setJobError(job.ID, "File audio tidak ditemukan di penyimpanan STB")
		return
	}

	baseName := strings.TrimSuffix(filepath.Base(finalFilePath), filepath.Ext(finalFilePath))
	// Bersihkan ID YouTube di akhir nama file jika ada: "Judul Lagu [ID]"
	title := baseName
	artist := "Unduhan YouTube"
	if idx := strings.LastIndex(title, " ["); idx != -1 && strings.HasSuffix(title, "]") {
		title = strings.TrimSpace(title[:idx])
	}
	if strings.Contains(title, " - ") {
		parts := strings.SplitN(title, " - ", 2)
		artist = strings.TrimSpace(parts[0])
		title = strings.TrimSpace(parts[1])
	}

	// Buat lirik .lrc asli di samping file audio
	lrcPath := strings.TrimSuffix(finalFilePath, filepath.Ext(finalFilePath)) + ".lrc"
	defaultLrc := fmt.Sprintf("[00:01.00] %s - %s\n[00:05.00] Format: %s (Koleksi Fisik STB)\n", artist, title, strings.ToUpper(job.Format))
	_ = os.WriteFile(lrcPath, []byte(defaultLrc), 0644)

	// Jika coverURL lokal tidak ada, gunakan URL thumbnail YouTube asli
	if coverURL == "" {
		targetQuery := job.Query
		if len(targetQuery) == 11 && !strings.Contains(targetQuery, " ") {
			coverURL = fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", targetQuery)
		} else if strings.Contains(job.Query, "watch?v=") {
			parts := strings.Split(job.Query, "watch?v=")
			if len(parts) > 1 {
				vID := strings.Split(parts[1], "&")[0]
				coverURL = fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", vID)
			}
		} else if idx := strings.LastIndex(baseName, " ["); idx != -1 && strings.HasSuffix(baseName, "]") {
			vID := baseName[idx+2 : len(baseName)-1]
			if len(vID) == 11 {
				coverURL = fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", vID)
			}
		}
	}

	songID := fmt.Sprintf("song_%d", time.Now().UnixNano())
	newSong := &models.Song{
		ID:         songID,
		Title:      title,
		Artist:     artist,
		Album:      "YouTube Download (" + strings.ToUpper(job.Format) + ")",
		Duration:   0,
		FilePath:   finalFilePath,
		CoverURL:   coverURL,
		Source:     "youtube",
		Lyrics:     defaultLrc,
		CreatedAt:  time.Now(),
	}

	_ = q.db.AddSong(newSong)

	q.jobsMu.Lock()
	job.Status = "completed"
	job.Title = title
	job.Percent = 100
	job.Speed = "Selesai"
	job.ETA = "0s"
	job.Progress = "Selesai diunduh & tersimpan di STB!"
	job.DownloadedSongID = songID
	q.jobsMu.Unlock()
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func (q *Queue) updateJobProgress(id, status string, percent int, progress, speed, eta string) {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()
	if j, ok := q.jobs[id]; ok {
		j.Status = status
		j.Percent = percent
		j.Progress = progress
		if speed != "-" {
			j.Speed = speed
		}
		if eta != "-" {
			j.ETA = eta
		}
	}
}

func (q *Queue) setJobError(id, errMsg string) {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()
	if j, ok := q.jobs[id]; ok {
		j.Status = "failed"
		j.Error = errMsg
		j.Progress = "Gagal"
		j.Speed = "-"
		j.ETA = "-"
	}
}
