package searcher

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SearchResult merepresentasikan item hasil pencarian live YouTube
type SearchResult struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Channel   string `json:"channel"`
	Duration  string `json:"duration"`
	Views     string `json:"views"`
	Date      string `json:"date"`
	Thumbnail string `json:"thumbnail"`
}

// SearchYouTube mencari langsung data live dari YouTube tanpa API Key
func SearchYouTube(query string) ([]SearchResult, error) {
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return []SearchResult{}, nil
	}

	searchURL := "https://www.youtube.com/results?search_query=" + url.QueryEscape(cleanQuery)
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	body := string(bodyBytes)

	idx := strings.Index(body, "var ytInitialData = ")
	if idx == -1 {
		idx = strings.Index(body, "ytInitialData = ")
		if idx == -1 {
			return nil, fmt.Errorf("ytInitialData tidak ditemukan")
		}
		idx += len("ytInitialData = ")
	} else {
		idx += len("var ytInitialData = ")
	}

	endIdx := strings.Index(body[idx:], ";</script>")
	if endIdx == -1 {
		endIdx = strings.Index(body[idx:], ";")
		if endIdx == -1 {
			return nil, fmt.Errorf("penutup script ytInitialData tidak ditemukan")
		}
	}
	rawJSON := body[idx : idx+endIdx]

	var root map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &root); err != nil {
		return nil, err
	}

	var results []SearchResult
	contents, ok := root["contents"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("konten root tidak valid")
	}
	twoCol, ok := contents["twoColumnSearchResultsRenderer"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("twoColumnSearchResultsRenderer tidak ditemukan")
	}
	primary, ok := twoCol["primaryContents"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("primaryContents tidak ditemukan")
	}
	secList, ok := primary["sectionListRenderer"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("sectionListRenderer tidak ditemukan")
	}
	secContents, ok := secList["contents"].([]interface{})
	if !ok || len(secContents) == 0 {
		return nil, fmt.Errorf("konten section kosong")
	}

	for _, sc := range secContents {
		scMap, ok := sc.(map[string]interface{})
		if !ok {
			continue
		}
		itemSec, ok := scMap["itemSectionRenderer"].(map[string]interface{})
		if !ok {
			continue
		}
		items, ok := itemSec["contents"].([]interface{})
		if !ok {
			continue
		}

		for _, item := range items {
			itemMap, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			vr, ok := itemMap["videoRenderer"].(map[string]interface{})
			if !ok {
				continue
			}

			vidID, _ := vr["videoId"].(string)
			if vidID == "" {
				continue
			}

			// Title
			title := ""
			if titleObj, ok := vr["title"].(map[string]interface{}); ok {
				if runs, ok := titleObj["runs"].([]interface{}); ok && len(runs) > 0 {
					if r0, ok := runs[0].(map[string]interface{}); ok {
						title, _ = r0["text"].(string)
					}
				}
			}
			if title == "" {
				continue
			}

			// Channel
			channel := ""
			if owner, ok := vr["ownerText"].(map[string]interface{}); ok {
				if runs, ok := owner["runs"].([]interface{}); ok && len(runs) > 0 {
					if r0, ok := runs[0].(map[string]interface{}); ok {
						channel, _ = r0["text"].(string)
					}
				}
			}

			// Duration
			duration := ""
			if lenTxt, ok := vr["lengthText"].(map[string]interface{}); ok {
				duration, _ = lenTxt["simpleText"].(string)
			}
			if duration == "" {
				duration = "-"
			}

			// Views
			views := ""
			if viewTxt, ok := vr["viewCountText"].(map[string]interface{}); ok {
				views, _ = viewTxt["simpleText"].(string)
			}
			if views == "" {
				views = "-"
			}

			// Date
			date := ""
			if pubTxt, ok := vr["publishedTimeText"].(map[string]interface{}); ok {
				date, _ = pubTxt["simpleText"].(string)
			}
			if date == "" {
				date = "-"
			}

			// Thumbnail YouTube asli (mqdefault / hqdefault)
			thumbnail := fmt.Sprintf("https://i.ytimg.com/vi/%s/mqdefault.jpg", vidID)

			results = append(results, SearchResult{
				ID:        vidID,
				Title:     title,
				Channel:   channel,
				Duration:  duration,
				Views:     views,
				Date:      date,
				Thumbnail: thumbnail,
			})

			if len(results) >= 25 {
				break
			}
		}
		if len(results) >= 25 {
			break
		}
	}

	return results, nil
}
