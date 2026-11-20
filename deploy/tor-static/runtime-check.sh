#!/bin/sh
# Pure validation of Tor's version/module reports; also exercised by local tests.
# The security floor was reviewed on 2026-11-19. Future updates require maintenance.
check_tor_runtime() {
  if [ "$#" -ne 2 ]; then
    printf '%s\n' 'Tor runtime reports are missing.' >&2
    return 1
  fi
  tor_runtime_version=$(printf '%s\n' "$1" | sed -nE 's/^Tor version ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(\.| \(git-[0-9a-fA-F]+\)\.)$/\1/p')
  if [ -z "$tor_runtime_version" ] || [ "$(printf '%s\n' "$tor_runtime_version" | wc -l)" -ne 1 ] \
      || ! dpkg --compare-versions "$tor_runtime_version" ge '0.4.9.17'; then
    printf '%s\n' 'A stable Tor version of at least 0.4.9.17 is required.' >&2
    return 1
  fi
  if ! printf '%s\n' "$1" | grep -Fq 'This build of Tor is covered by the GNU General Public License' \
      || ! printf '%s\n' "$2" | grep -Eq '^pow: yes$'; then
    printf '%s\n' 'Tor must include the PoW module and GPL puzzle libraries.' >&2
    return 1
  fi
}
