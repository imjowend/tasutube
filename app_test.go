package main

import (
	"testing"
)

func TestAppQueueAndState(t *testing.T) {
	app := newAppWithYtdlp(fakeYtdlp(t, "exit 0\n"))

	// Initial queue should be empty
	queue := app.GetQueue()
	if len(queue) != 0 {
		t.Fatalf("Initial queue len = %d; want 0", len(queue))
	}

	// Enqueue an item
	id, err := app.Download("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "mp3", "alta")
	if err != nil {
		t.Fatalf("Download() error = %v", err)
	}
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
	got, err := app.GetDownloadPath()
	if err != nil {
		t.Fatalf("GetDownloadPath() error = %v", err)
	}
	if got != "/tmp/my-downloads" {
		t.Errorf("GetDownloadPath() = %q; want /tmp/my-downloads", got)
	}

	// Test Cancel
	if err := app.Cancel(1); err != nil {
		t.Logf("Cancel(1) returned: %v", err)
	}
}

func TestDownloadRejectsEmptyURL(t *testing.T) {
	app := NewApp()

	id, err := app.Download("   ", "mp3", "alta")
	if err == nil {
		t.Fatal("Download(\"   \") error = nil; want an error")
	}
	if id != 0 {
		t.Errorf("Download(\"   \") id = %d; want 0", id)
	}
	if n := len(app.GetQueue()); n != 0 {
		t.Errorf("Queue len = %d; want 0", n)
	}
}

func TestCancelUnknownIDReturnsError(t *testing.T) {
	app := NewApp()

	if err := app.Cancel(999); err == nil {
		t.Error("Cancel(999) error = nil; want an error")
	}
}
