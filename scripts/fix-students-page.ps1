$f = "c:\Users\migue\OneDrive\Desktop\miguel\bidii ready\bidii-system.8\src\app\principal\students\page.tsx"
$lines = Get-Content $f
$out = [System.Collections.Generic.List[string]]::new()
$skip = $false
foreach ($line in $lines) {
    if ($line -match 'function handleSearch') { $skip = $true }
    if (-not $skip) { $out.Add($line) }
    if ($skip -and $line -match '^\s*\}\s*$') { $skip = $false }
}
Set-Content $f $out
Write-Host "Done. Lines: $($out.Count)"
