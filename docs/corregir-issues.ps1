# Corrige los acentos de las historias de usuario en GitHub (una sola vez)
# Ejecutar desde la carpeta del proyecto: powershell -ExecutionPolicy Bypass -File docs\corregir-issues.ps1
# Este archivo usa solo caracteres sin acento para que Windows lo lea bien;
# los textos con acento se toman de docs\historias-usuario.md.
$ErrorActionPreference = "Stop"
$repo = "VanessaAndrade0/it-mexico"
$utf8 = New-Object System.Text.UTF8Encoding $false
$md = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot "historias-usuario.md"), $utf8)
$md = $md -replace "`r`n", "`n"
$tmp = Join-Path $env:TEMP "issue-itmexico.md"
$criterios = "**Criterios de aceptaci" + [char]0x00F3 + "n**"

# Etiqueta con acento
$mal = "Dise" + [char]0x00C3 + [char]0x00B1 + "o"
$bien = "Dise" + [char]0x00F1 + "o"
$hayMal = gh label list --repo $repo --limit 100 --json name --jq ".[].name" | Where-Object { $_ -eq $mal }
if ($hayMal) {
  gh label edit $mal --repo $repo --name $bien | Out-Null
  Write-Host "Etiqueta corregida: $bien"
}

$rx = [regex]'(?ms)^### (\d+)\. (.+?)\n(.*?)(?=^### |^---|\z)'
$total = 0
foreach ($m in $rx.Matches($md)) {
  $n = $m.Groups[1].Value
  $titulo = "$n. " + $m.Groups[2].Value.Trim()
  $texto = $m.Groups[3].Value.Trim()
  $i = $texto.IndexOf("`n- ")
  if ($i -ge 0) {
    $cuerpo = $texto.Substring(0, $i).Trim() + "`n`n" + $criterios + "`n" + $texto.Substring($i + 1).Trim()
  } else {
    $cuerpo = $texto
  }
  [System.IO.File]::WriteAllText($tmp, $cuerpo, $utf8)
  gh issue edit $n --repo $repo --title $titulo --body-file $tmp | Out-Null
  Write-Host "  #$n corregida"
  $total++
}
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host "Listo: $total historias corregidas."