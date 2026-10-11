# Spelar in spelets talade meddelanden med Windows engelska röst (Microsoft Zira)
# till public/voice/. Kör från projektroten: powershell -File scripts/generateVoice.ps1
Add-Type -AssemblyName System.Speech
$lines = @{
  'construction-complete' = 'Construction complete.'
  'commander-down'        = 'Commander down.'
  'commander-online'      = 'Commander online.'
}
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Zira Desktop')
$synth.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($name in $lines.Keys) {
  $path = Join-Path (Resolve-Path 'public/voice') "$name.wav"
  $synth.SetOutputToWaveFile($path, $format)
  $synth.Speak($lines[$name])
}
$synth.SetOutputToNull()
$synth.Dispose()
