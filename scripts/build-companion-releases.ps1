param(
  [string]$OutputDirectory = "dist/companion"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $projectRoot "services/local-library-helper"
$releaseDirectory = Join-Path $projectRoot $OutputDirectory

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

$targets = @(
  @{ Os = "windows"; Arch = "amd64"; Extension = ".exe" },
  @{ Os = "windows"; Arch = "arm64"; Extension = ".exe" },
  @{ Os = "darwin"; Arch = "amd64"; Extension = "" },
  @{ Os = "darwin"; Arch = "arm64"; Extension = "" },
  @{ Os = "linux"; Arch = "amd64"; Extension = "" },
  @{ Os = "linux"; Arch = "arm64"; Extension = "" }
)

Push-Location $sourceDirectory
try {
  go test ./...
  foreach ($target in $targets) {
    $env:CGO_ENABLED = "0"
    $env:GOOS = $target.Os
    $env:GOARCH = $target.Arch
    $filename = "Impala-Local-Library-Companion-$($target.Os)-$($target.Arch)$($target.Extension)"
    $destination = Join-Path $releaseDirectory $filename
    Write-Host "Building $filename"
    go build -trimpath -ldflags "-s -w" -o $destination .
  }
}
finally {
  Pop-Location
  Remove-Item Env:GOOS -ErrorAction SilentlyContinue
  Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
  Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
}

Write-Host "Companion releases written to $releaseDirectory"
