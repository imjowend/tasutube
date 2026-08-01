package downloader

import "testing"

func TestValidateURLAcceptsHTTP(t *testing.T) {
	valid := []string{
		"https://www.youtube.com/watch?v=abc123",
		"https://youtu.be/abc123",
		"http://example.com/v",
	}
	for _, u := range valid {
		if _, err := ValidateURL(u); err != nil {
			t.Errorf("ValidateURL(%q) error = %v; want nil", u, err)
		}
	}
}

func TestValidateURLRejectsUnsafe(t *testing.T) {
	invalid := []string{
		"",
		"   ",
		"--exec=touch /tmp/pwned",
		"-J",
		"file:///etc/passwd",
		"https://youtu.be/abc\n--exec=id",
	}
	for _, u := range invalid {
		if _, err := ValidateURL(u); err == nil {
			t.Errorf("ValidateURL(%q) = nil error; want error", u)
		}
	}
}
