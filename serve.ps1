# Local static preview of public/ with Cloudflare-Pages-style clean URLs. /api/* is not available locally.
param([int]$Port = 4173)
$root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'public'
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.mjs'='text/javascript'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.svg'='image/svg+xml'; '.xml'='application/xml'; '.txt'='text/plain; charset=utf-8'; '.json'='application/json'; '.yml'='text/yaml; charset=utf-8'; '.md'='text/markdown; charset=utf-8' }
$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
"Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ($rel -eq '') { $rel = 'index.html' }
  $file = Join-Path $root $rel
  if (-not (Test-Path $file -PathType Leaf) -and (Test-Path "$file.html")) { $file = "$file.html" }
  elseif (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
  $status = 200
  if ($rel.StartsWith('api/') -or -not (Test-Path $file -PathType Leaf) -or -not ([IO.Path]::GetFullPath($file)).StartsWith($root)) {
    $status = 404; $file = Join-Path $root '404.html'
  }
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $types[[IO.Path]::GetExtension($file)]
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
