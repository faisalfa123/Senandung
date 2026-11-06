package downloader

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
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

	// Cari binary yt-dlp dan ffmpeg yang tersedia
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

	// Jalankan single-worker background goroutine (1 antrean concurrent)
	go q.worker()

	return q
}

func (q *Queue) AddJob(query string) *models.DownloadJob {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()

	job := &models.DownloadJob{
		ID:       fmt.Sprintf("job_%d", time.Now().UnixNano()),
		Query:    strings.TrimSpace(query),
		Status:   "pending",
		Progress: "Menunggu antrean...",
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
	q.updateJob(job.ID, "downloading", "Mengambil informasi audio...")

	// Gunakan yt-dlp untuk ekstrak info dan download dengan nice rendah (nice 19)
	outputTemplate := filepath.Join(q.musicDir, "%(title)s [%(id)s].%(ext)s")

	// Argumen yt-dlp: unduh bestaudio, ekstrak ke mp3 (128k untuk efisiensi STB), write-thumbnail
	args := []string{
		"-x",
		"--audio-format", "mp3",
		"--audio-quality", "128K",
		"--embed-thumbnail",
		"--add-metadata",
		"--write-thumbnail",
		"--convert-thumbnails", "jpg",
		"--output", outputTemplate,
		"--print-json",
		"--no-playlist",
	}

	// Jika input adalah search query (bukan URL), gunakan ytsearch:
	target := job.Query
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = "ytsearch1:" + target
	}
	args = append(args, target)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, q.ytDlpBinary, args...)

	// Jalankan dengan nice 19 (idle) jika command 'nice' tersedia di Linux
	if _, err := exec.LookPath("nice"); err == nil {
		niceArgs := append([]string{"-n", "19", q.ytDlpBinary}, args...)
		cmd = exec.CommandContext(ctx, "nice", niceArgs...)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[Downloader] Error downloading %s: %v, output: %s", job.Query, err, string(output))
		q.setJobError(job.ID, fmt.Sprintf("Gagal download: %v (Pastikan yt-dlp & ffmpeg terpasang)", err))
		return
	}

	// Parse JSON dari output yt-dlp
	lines := strings.Split(string(output), "\n")
	var metadata map[string]interface{}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "{") && strings.HasSuffix(line, "}") {
			if err := json.Unmarshal([]byte(line), &metadata); err == nil {
				break
			}
		}
	}

	videoID, _ := metadata["id"].(string)
	title, _ := metadata["title"].(string)
	artist, _ := metadata["uploader"].(string)
	if a, ok := metadata["artist"].(string); ok && a != "" {
		artist = a
	}
	duration, _ := metadata["duration"].(float64)

	if title == "" {
		title = job.Query
	}

	// Cari file audio hasil download
	var finalFilePath string
	var coverURL string

	entries, _ := os.ReadDir(q.musicDir)
	for _, entry := range entries {
		if !entry.IsDir() && strings.Contains(entry.Name(), videoID) {
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext == ".mp3" || ext == ".m4a" || ext == ".opus" {
				finalFilePath = filepath.Join(q.musicDir, entry.Name())
			} else if ext == ".jpg" || ext == ".webp" || ext == ".png" {
				// Pindahkan cover ke direktori cover
				coverDest := filepath.Join(q.coverDir, videoID+ext)
				_ = os.Rename(filepath.Join(q.musicDir, entry.Name()), coverDest)
				coverURL = "/api/covers/" + videoID + ext
			}
		}
	}

	if finalFilePath == "" {
		// Fallback: cari file mp3 terbaru
		q.setJobError(job.ID, "File audio tidak ditemukan setelah proses selesai")
		return
	}

	songID := fmt.Sprintf("song_%d", time.Now().UnixNano())
	newSong := &models.Song{
		ID:         songID,
		Title:      title,
		Artist:     artist,
		Album:      "YouTube Download",
		Duration:   duration,
		FilePath:   finalFilePath,
		CoverURL:   coverURL,
		Source:     "youtube",
		YoutubeURL: "https://www.youtube.com/watch?v=" + videoID,
		CreatedAt:  time.Now(),
	}

	if err := q.db.AddSong(newSong); err != nil {
		log.Printf("[Downloader] Gagal simpan ke DB: %v", err)
	}

	q.jobsMu.Lock()
	job.Status = "completed"
	job.Title = title
	job.Progress = "Selesai diunduh!"
	job.DownloadedSongID = songID
	q.jobsMu.Unlock()
}

func (q *Queue) updateJob(id, status, progress string) {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()
	if j, ok := q.jobs[id]; ok {
		j.Status = status
		j.Progress = progress
	}
}

func (q *Queue) setJobError(id, errMsg string) {
	q.jobsMu.Lock()
	defer q.jobsMu.Unlock()
	if j, ok := q.jobs[id]; ok {
		j.Status = "failed"
		j.Error = errMsg
		j.Progress = "Gagal"
	}
}
