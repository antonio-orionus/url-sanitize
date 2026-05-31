class UrlSanitize < Formula
  desc "Remove tracking parameters and unwrap tracking redirects from URLs"
  homepage "https://github.com/antonio-orionus/url-sanitize"
  version "0.1.3"
  license "MIT"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-aarch64-apple-darwin.tar.gz"
      sha256 "bb9ac5665a13e7fafdbe55457d9c3b322403d02d96f5dde6885d01e6ba4cd501"
    else
      odie "macOS Intel release archives are not published yet; use `cargo install url-sanitize`"
    end
  elsif OS.linux?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "ea01a2151e43d076ec2d042a38ff6ef8ecba5113c472fed9064f8e047f0e97ba"
    elsif Hardware::CPU.intel?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "ff5216835c5b61518d193922b71e93f0a610c75e55f936625c2f161d280f33cd"
    else
      odie "unsupported Linux architecture"
    end
  else
    odie "unsupported operating system"
  end

  def install
    bin.install "url-sanitize"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/url-sanitize --version")
    assert_equal "https://example.com/", shell_output("#{bin}/url-sanitize https://example.com/?utm_source=x").strip
  end
end
