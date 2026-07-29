package main

import (
	"testing"
)

func TestAppQueueAndState(t *testing.T) {
	app := NewApp()

	// Initial queue should be empty
	queue := app.GetQueue()
	if len(queue) != 0 {
		t.Fatalf("Initial queue len = %d; want 0", len(queue))
	}

	// Enqueue an item
	id := app.Download("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "mp3", "alta")
	if id != 1 {
		t.Errorf("First Download id = %d; want 1", id)
	}

	// Queue should have 1 item in pending or downloading state
	queue = app.GetQueue()
	if len(queue) != 1 {
		t.Fatalf("Queue len = %d; want 1", len(queue))
	}

	if queue[0].ID != 1 {
		t.Errorf("Item ID = %d; want 1", queue[0].ID)
	}

	// Test SetDownloadPath and GetDownloadPath
	app.SetDownloadPath("/tmp/my-downloads")
	if got := app.GetDownloadPath(); got != "/tmp/my-downloads" {
		t.Errorf("GetDownloadPath() = %q; want /tmp/my-downloads", got)
	}

	// Test Cancel
	app.Cancel(1)
}
