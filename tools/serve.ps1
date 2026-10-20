param([int]$Port = 5173, [string]$Root = (Join-Path $PSScriptRoot '..'))
# Minimal static file server for local development (no node/python on this machine).
$Root = (Resolve-Path $Root).Path
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json'; '.bin'='application/octet-stream'; '.jpg'='image/jpeg'; '.png'='image/png'
  '.webp'='image/webp'; '.svg'='image/svg+xml'; '.obj'='text/plain'; '.woff2'='font/woff2'; '.ico'='image/x-icon'
}
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    # Dev-only: dev/build.html posts generated assets here (restricted to assets/).
    if ($ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -eq '/save') {
      $name = [IO.Path]::GetFileName($ctx.Request.QueryString['file'])
      $out = Join-Path $Root "assets\$name"
      $fs = [IO.File]::Create($out); $ctx.Request.InputStream.CopyTo($fs); $fs.Close()
      Write-Host "SAVED assets/$name ($((Get-Item $out).Length) bytes)"
      continue
    }
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if ($path.StartsWith($Root) -and [IO.File]::Exists($path)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = $mime[$ext] ?? 'application/octet-stream'
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host "200 $rel"
    } else { $ctx.Response.StatusCode = 404; Write-Host "404 $rel" }
  } catch { Write-Host "ERR $_" }
  finally { $ctx.Response.Close() }
}
