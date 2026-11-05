#!/bin/sh
# Installs Pilot on macOS or Linux: the newest release for this machine (or the version given),
# checked against the release's SHA256SUMS.txt, into ~/.local/bin (PILOT_INSTALL_DIR to choose
# another folder). Run it again to update, or use `pilot update`.
#   curl -fsSL https://github.com/FranciscoNunes-dxspark/pilot/releases/latest/download/pilot-install.sh | sh
#   sh pilot-install.sh 0.2.0      that version
set -eu

# PILOT_INSTALL_BASE: where the releases are (a test's stand-in for GitHub).
BASE="${PILOT_INSTALL_BASE:-https://github.com/FranciscoNunes-dxspark/pilot}"
DIR="${PILOT_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() { printf 'pilot-install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) fail "this script is for macOS and Linux; on Windows run pilot-windows-x64-setup.exe or pilot-install.ps1" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "no Pilot build for $(uname -m)" ;;
esac
FILE="pilot-$os-$arch"

# The newest release, or the version asked for.
if [ "${1:-}" != "" ]; then
  from="$BASE/releases/download/v${1#v}"
  which="v${1#v}"
else
  from="$BASE/releases/latest/download"
  which="the newest release"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT INT TERM

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$work/$1" "$from/$1" || fail "couldn't download $1 from $which"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$work/$1" "$from/$1" || fail "couldn't download $1 from $which"
  else
    fail "curl or wget is needed"
  fi
}

say "Downloading $FILE from $which…"
download "$FILE"
download SHA256SUMS.txt

want="$(grep " [ *]$FILE\$" "$work/SHA256SUMS.txt" | cut -d' ' -f1)"
[ -n "$want" ] || fail "SHA256SUMS.txt has no checksum for $FILE"
if command -v sha256sum >/dev/null 2>&1; then got="$(sha256sum "$work/$FILE" | cut -d' ' -f1)"; else got="$(shasum -a 256 "$work/$FILE" | cut -d' ' -f1)"; fi
[ "$got" = "$want" ] || fail "the download doesn't match its checksum: not installed"

mkdir -p "$DIR"
chmod 755 "$work/$FILE"
# A move, so a Pilot running from there keeps the copy it started from.
mv -f "$work/$FILE" "$DIR/pilot"
# macOS keeps a downloaded program from starting until the quarantine mark is gone.
if [ "$os" = macos ]; then xattr -d com.apple.quarantine "$DIR/pilot" 2>/dev/null || true; fi

say "Installed $("$DIR/pilot" --version 2>/dev/null || echo "$which") in $DIR/pilot."
case ":$PATH:" in
  *":$DIR:"*) ;;
  *)
    say ""
    say "$DIR isn't on your PATH. Add it (then open a new terminal):"
    case "${SHELL:-}" in
      */zsh) say "  echo 'export PATH=\"$DIR:\$PATH\"' >> ~/.zshrc" ;;
      */fish) say "  fish_add_path $DIR" ;;
      *) say "  echo 'export PATH=\"$DIR:\$PATH\"' >> ~/.bashrc" ;;
    esac
    ;;
esac
say ""
say "Next:"
say "  pilot app                 Pilot's window: recent projects, Open a folder"
say "  pilot ui                  the UI in your browser, for the project in this folder"
say "  pilot init --mcp          connect Claude Code to the project in this folder"
