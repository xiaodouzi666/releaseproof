param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$Rate = -1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  try {
    $voice.SelectVoice("Microsoft Zira Desktop")
  }
  catch {
    # Restricted Windows sessions can enumerate Zira but refuse to select it.
    # The checked-in voice cache avoids this path on normal rebuilds; using the
    # session default still keeps a clean bootstrap possible.
    Write-Warning "Microsoft Zira Desktop is unavailable; using $($voice.Voice.Name)."
  }
  $voice.Rate = $Rate
  $voice.Volume = 100
  $voice.SetOutputToWaveFile($resolvedOutput)
  $voice.Speak($Text)
}
finally {
  $voice.Dispose()
}
