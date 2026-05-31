class UrlSanitize < Formula
  desc "Remove tracking parameters and unwrap tracking redirects from URLs"
  homepage "https://github.com/antonio-orionus/url-sanitize"
  version "0.1.2"
  license "MIT"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-aarch64-apple-darwin.tar.gz"
      sha256 "3a11ede5f1f9682a538b6badfc8bd453075c25b2459c2ad67b242ce8a3a3c4f7"
    else
      odie "macOS Intel release archives are not published yet; use `cargo install url-sanitize`"
    end
  elsif OS.linux?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "fc2dd9911e1e8739395964e8b39fd0093d9c24959e9bcdbdb611bc383593a1d0"
    elsif Hardware::CPU.intel?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/url-sanitize-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "130801abd4f3fb32b5442398c1ab08346f0e96c01de8152f43858e72aadec8d8"
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
