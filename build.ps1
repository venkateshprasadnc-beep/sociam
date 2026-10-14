# Local preview build for Windows. Mirrors lib/content.mjs, which Cloudflare runs as `node build.mjs`.
#   src/layout.html        shared page shell
#   src/pages/*.html       pages: "@key: value" lines (@title @desc @nav @robots), a blank line, then HTML.
#                          "about__venkatesh-nc.html" becomes /about/venkatesh-nc
#   content/posts/*.md     blog posts written in Decap CMS: a JSON front-matter object, then Markdown
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object Text.UTF8Encoding $false
$site = 'https://sociam.in'
$dot = [char]0xB7
$months = 'January','February','March','April','May','June','July','August','September','October','November','December'
function ReadText($p) { ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) -replace "`r`n", "`n").TrimStart([char]0xFEFF) }
function Esc($s) { ([string]$s).Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;').Replace("'", '&#39;') }

# ---------- Markdown ----------
function Inline([string]$src) {
  $stash = New-Object Collections.Generic.List[string]
  $keep = { param($h) $stash.Add($h); "$([char]0)$($stash.Count - 1)$([char]0)" }
  $s = [regex]::Replace($src, '\\([\\`*_{}\[\]()#+\-.!>~|])', { param($m) & $keep (Esc $m.Groups[1].Value) })
  $s = [regex]::Replace($s, '`([^`]+)`', { param($m) & $keep "<code>$(Esc $m.Groups[1].Value)</code>" })
  $s = [regex]::Replace($s, '!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)', { param($m)
    $t = if ($m.Groups[3].Success -and $m.Groups[3].Value) { " title=`"$(Esc $m.Groups[3].Value)`"" } else { '' }
    & $keep "<img src=`"$(Esc $m.Groups[2].Value)`" alt=`"$(Esc $m.Groups[1].Value)`"$t loading=`"lazy`">" })
  $s = [regex]::Replace($s, '\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)', { param($m)
    $url = $m.Groups[2].Value
    $ext = ($url -match '^(?i)https?://') -and ($url -notmatch '^(?i)https?://(www\.)?sociam\.in(/|$)')
    $t = if ($m.Groups[3].Success -and $m.Groups[3].Value) { " title=`"$(Esc $m.Groups[3].Value)`"" } else { '' }
    $x = if ($ext) { ' target="_blank" rel="noopener"' } else { '' }
    & $keep "<a href=`"$(Esc $url)`"$t$x>$(Inline $m.Groups[1].Value)</a>" })
  $s = Esc $s
  $s = [regex]::Replace($s, '\*\*(?!\s)([^*]+?)\*\*', '<strong>$1</strong>')
  $s = [regex]::Replace($s, '__(?!\s)([^_]+?)__', '<strong>$1</strong>')
  $s = [regex]::Replace($s, '\*(?!\s)([^*]+?)\*', '<em>$1</em>')
  $s = [regex]::Replace($s, '(^|[^\w])_(?!\s)([^_]+?)_(?![\w])', '$1<em>$2</em>')
  $s = [regex]::Replace($s, '(?: {2,}|\\)\n', "<br>`n")
  return [regex]::Replace($s, "$([char]0)(\d+)$([char]0)", { param($m) $stash[[int]$m.Groups[1].Value] })
}

$reBlank = '^\s*$'; $reHead = '^(#{1,6})\s+(.*?)\s*#*\s*$'; $reHr = '^\s*([-*_])(\s*\1){2,}\s*$'; $reFence = '^\s*```'
$reQuote = '^\s*>'; $reItem = '^\s*([-*+]|\d+[.)])\s+(.*)$'; $reHtml = '^\s*</?[a-zA-Z][^>]*>'
function StartsBlock($l) { ($l -match $reHead) -or ($l -match $reHr) -or ($l -match $reFence) -or ($l -match $reQuote) -or ($l -match $reItem) }

function Markdown([string]$md) {
  $lines = ($md -replace "`r`n?", "`n").Split("`n")
  $out = New-Object Collections.Generic.List[string]
  $i = 0
  while ($i -lt $lines.Count) {
    $l = $lines[$i]
    if ($l -match $reBlank) { $i++; continue }
    if ($l -match $reHead) { $n = $Matches[1].Length; $out.Add("<h$n>$(Inline $Matches[2])</h$n>"); $i++; continue }
    if ($l -match $reHr) { $out.Add('<hr>'); $i++; continue }
    if ($l -match $reFence) {
      $buf = @(); $i++
      while ($i -lt $lines.Count -and $lines[$i] -notmatch $reFence) { $buf += $lines[$i]; $i++ }
      $i++
      $out.Add("<pre><code>$(Esc ($buf -join "`n"))</code></pre>"); continue
    }
    if ($l -match $reQuote) {
      $buf = @()
      while ($i -lt $lines.Count -and $lines[$i] -match $reQuote) { $buf += ($lines[$i] -replace '^\s*>\s?', ''); $i++ }
      $inner = [regex]::Replace((Markdown ($buf -join "`n")), '^<p>([\s\S]*)</p>$', '$1')
      $out.Add("<blockquote>$inner</blockquote>"); continue
    }
    if ($l -match $reItem) {
      $ordered = $Matches[1] -match '\d'
      $items = New-Object Collections.Generic.List[string]
      while ($i -lt $lines.Count) {
        $cur = $lines[$i]
        $mm = [regex]::Match($cur, $reItem)
        if ($mm.Success -and (($mm.Groups[1].Value -match '\d') -eq $ordered)) { $items.Add($mm.Groups[2].Value); $i++; continue }
        if (-not $mm.Success -and $items.Count -and ($cur -notmatch $reBlank) -and ($cur -match '^\s{2,}\S')) { $items[$items.Count - 1] += ' ' + $cur.Trim(); $i++; continue }
        if (($cur -match $reBlank) -and ($i + 1 -lt $lines.Count)) {
          $nx = [regex]::Match($lines[$i + 1], $reItem)
          if ($nx.Success -and (($nx.Groups[1].Value -match '\d') -eq $ordered)) { $i++; continue }
        }
        break
      }
      $tag = if ($ordered) { 'ol' } else { 'ul' }
      $out.Add("<$tag>`n" + (($items | ForEach-Object { "  <li>$(Inline $_)</li>" }) -join "`n") + "`n</$tag>"); continue
    }
    if ($l -match $reHtml) {
      $buf = @()
      while ($i -lt $lines.Count -and $lines[$i] -notmatch $reBlank) { $buf += $lines[$i]; $i++ }
      $out.Add($buf -join "`n"); continue
    }
    $buf = @()
    while ($i -lt $lines.Count -and $lines[$i] -notmatch $reBlank -and -not (StartsBlock $lines[$i])) { $buf += $lines[$i]; $i++ }
    $out.Add("<p>$(Inline ($buf -join "`n"))</p>")
  }
  return $out -join "`n"
}

# ---------- sources ----------
function ParsePage($raw) {
  $i = $raw.IndexOf("`n`n")
  $meta = @{ title = 'Sociam'; desc = ''; nav = ''; robots = 'index,follow' }
  foreach ($line in $raw.Substring(0, $i).Split("`n")) { if ($line -match '^@(\w+):\s*(.*)$') { $meta[$Matches[1]] = $Matches[2].Trim() } }
  return @{ meta = $meta; body = $raw.Substring($i + 2) }
}

function ParsePost($file, $raw) {
  $data = [pscustomobject]@{}; $body = $raw
  if ($raw.StartsWith('{')) {
    $m = [regex]::Match($raw, '(?m)^\}[ \t]*$')
    $data = $raw.Substring(0, $m.Index + 1) | ConvertFrom-Json
    $body = [regex]::Replace($raw.Substring($m.Index + 1), '^[^\n]*\n?', '')
  }
  $p = @{}
  foreach ($prop in $data.PSObject.Properties) { $p[$prop.Name] = $prop.Value }
  $slugSrc = if ($p.slug) { [string]$p.slug } else { $file -replace '\.md$', '' }
  $p.slug = ($slugSrc.ToLower().Trim() -replace '[^a-z0-9]+', '-').Trim('-')
  $p.body = $body; $p.file = $file -replace '\.md$', ''
  $p.label = if ($p.industry) { $p.industry } elseif ($p.category) { $p.category } else { 'Blog' }
  $words = @($body -split '\s+' | Where-Object { $_ }).Count
  $p.minutes = [math]::Max(1, [math]::Floor($words / 220 + 0.5))
  $p.time = 0; $p.dto = $null
  $dto = [DateTimeOffset]::MinValue
  if ($p.date -and [DateTimeOffset]::TryParse([string]$p.date, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$dto)) { $p.time = $dto.ToUnixTimeMilliseconds(); $p.dto = $dto }
  return $p
}

function FmtDate($p, [bool]$long) {
  $d = $p.dto.ToOffset([TimeSpan]::FromMinutes(330))
  $m = $months[$d.Month - 1]; if (-not $long) { $m = $m.Substring(0, 3) }
  "$($d.Day) $m $($d.Year)"
}
function CatClass($label) { 'cat-' + (([string]$label).ToLower() -replace '[^a-z]+', '-') }

function Card($p) {
  $img = if ($p.image) { "<img src=`"$(Esc $p.image)`" alt=`"$(Esc $p.image_alt)`" loading=`"lazy`" width=`"1200`" height=`"630`">" } else { '' }
  $hi = if ($p.image) { ' has-img' } else { '' }
  "      <a class=`"post-card`" href=`"/blog/$($p.slug)`" data-cat=`"$(Esc $p.category)`" data-ind=`"$(Esc $p.industry)`">`n" +
  "        <div class=`"cover $(CatClass $p.label)$hi`" aria-hidden=`"true`">$img<span class=`"cat`">$(Esc $p.label)</span></div>`n" +
  "        <div class=`"body`"><h3>$(Esc $p.title)</h3><p>$(Esc $p.excerpt)</p><p class=`"meta`">$(FmtDate $p $false) $dot $($p.minutes) min read</p></div>`n      </a>"
}

function FeaturedCard($p) {
  if (-not $p) { return '' }
  $img = if ($p.image) { "<img src=`"$(Esc $p.image)`" alt=`"$(Esc $p.image_alt)`" loading=`"lazy`" width=`"1200`" height=`"630`">" } else { '' }
  $hi = if ($p.image) { ' has-img' } else { '' }
  $lead = if ($p.dek) { $p.dek } else { $p.excerpt }
  "    <a class=`"feature-card`" href=`"/blog/$($p.slug)`">`n      <div class=`"cover $(CatClass $p.label)$hi`" aria-hidden=`"true`">$img<span class=`"cat`">$(Esc $p.label)</span></div>`n" +
  "      <div class=`"body`"><span class=`"kicker`">Featured $dot $(Esc $p.category)</span><h2>$(Esc $p.title)</h2><p>$(Esc $lead)</p><p class=`"meta`">$($p.minutes) min read</p></div>`n    </a>"
}

function RelatedFor($p, $live) {
  # the CMS stores related articles by file name; the URL slug may differ
  $chosen = @(); foreach ($s in @($p.related)) { $x = $live | Where-Object { ($_.file -eq $s -or $_.slug -eq $s) -and $_.slug -ne $p.slug -and $chosen -notcontains $_ } | Select-Object -First 1; if ($x) { $chosen += $x } }
  $rest = @($live | Where-Object { $_.slug -ne $p.slug -and $chosen -notcontains $_ })
  @($chosen + @($rest | Where-Object { $_.category -eq $p.category }) + @($rest | Where-Object { $_.category -ne $p.category })) | Select-Object -First 3
}

function ArticleBody($p, $live) {
  $trail = if ($p.industry) { "<a href=`"/blog?topic=Industries`" style=`"text-decoration:none`">Industries</a> $dot $(Esc $p.industry)" } else { "<a href=`"/blog?topic=$([uri]::EscapeDataString([string]$p.category))`" style=`"text-decoration:none`">$(Esc $p.category)</a>" }
  $hero = if ($p.image) { "<figure class=`"post-hero-img`"><img src=`"$(Esc $p.image)`" alt=`"$(Esc $p.image_alt)`"></figure>" } else { "<div class=`"cover post-hero-cover $(CatClass $p.label)`" aria-hidden=`"true`"></div>" }
  $author = if ($p.author) { $p.author } else { 'Sociam' }
  $rel = (RelatedFor $p $live | ForEach-Object { Card $_ }) -join "`n"
@"
<div class="read-progress" aria-hidden="true"></div>
<article>
  <header class="article-head">
    <div class="wrap">
      <p class="eyebrow" style="justify-content:center"><a href="/blog" style="text-decoration:none">Blog</a> $dot $trail</p>
      <h1>$(Esc $p.title)</h1>
      <p class="dek">$(Esc $p.dek)</p>
      <p class="meta"><span>By $(Esc $author)</span><time datetime="$(Esc $p.date)">$(FmtDate $p $true)</time><span>$($p.minutes) min read</span></p>
    </div>
  </header>
  <div class="wrap" style="margin-bottom:clamp(48px,6vw,88px)">$hero</div>
  <div class="prose">
$(Markdown $p.body)
    <div class="article-end">
      <p class="aside">Published by Sociam, Bengaluru. Questions or a different view? Write to <a href="mailto:venki.sociam@gmail.com">venki.sociam@gmail.com</a>.</p>
      <div class="row" style="margin-top:20px"><a class="btn-talk" href="/contact" data-cta="post-talk">Let's talk</a><a class="link" href="/solutions">Explore solutions</a></div>
    </div>
  </div>
</article>
<section class="sec paper">
  <div class="wrap">
    <p class="eyebrow">Keep reading</p>
    <h2>More from the blog.</h2>
    <div class="post-cards">
$rel
    </div>
  </div>
</section>

"@
}

$layout = ReadText "$root\src\layout.html"
function Render($o, $body) {
  $html = $layout.Replace('{{content}}', $body).Replace('{{head}}', $o.head).Replace('{{title}}', $o.title).Replace('{{desc}}', $o.desc).
    Replace('{{robots}}', $o.robots).Replace('{{canonical}}', "$site$($o.path)").Replace('{{page}}', $o.page).Replace('{{ogtype}}', $o.ogType).Replace('{{ogimage}}', $o.ogImage)
  return $html.Replace("data-nav=`"$($o.nav)`"", "data-nav=`"$($o.nav)`" aria-current=`"page`"")
}
function Abs($u) { if ($u -match '^https?://') { $u } else { "$site$u" } }

# ---------- build ----------
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$all = @(Get-ChildItem "$root\content\posts\*.md" | Sort-Object Name | ForEach-Object { ParsePost $_.Name (ReadText $_.FullName) }) |
  Sort-Object @{ e = { $_.time }; Descending = $true }, @{ e = { $_.slug } }
$live = @($all | Where-Object { $_.published -ne $false -and $_.time -gt 0 -and $_.time -le $now })
$urls = @()

if (Test-Path "$root\public\blog") { Remove-Item "$root\public\blog" -Recurse -Force }
New-Item -ItemType Directory -Force "$root\public\blog" | Out-Null
foreach ($p in $live) {
  $ld = [ordered]@{ '@context' = 'https://schema.org'; '@type' = 'BlogPosting'; headline = $p.title; description = $(if ($p.meta_description) { $p.meta_description } else { $p.excerpt }); datePublished = $p.date
    author = @{ '@type' = $(if ($p.author -and $p.author -ne 'Sociam') { 'Person' } else { 'Organization' }); name = $(if ($p.author) { $p.author } else { 'Sociam' }) }
    publisher = @{ '@type' = 'Organization'; name = 'Sociam'; url = $site }; articleSection = $p.label; mainEntityOfPage = "$site/blog/$($p.slug)" }
  if ($p.keywords) { $ld.keywords = $p.keywords }
  if ($p.image) { $ld.image = Abs $p.image }
  $o = @{ title = $(if ($p.seo_title) { Esc $p.seo_title } else { Esc "$($p.title) | Sociam" }); desc = Esc $(if ($p.meta_description) { $p.meta_description } else { $p.excerpt })
          robots = 'index,follow'; nav = 'blog'; path = "/blog/$($p.slug)"; page = 'post'; ogType = 'article'
          ogImage = Esc (Abs $(if ($p.social_image) { $p.social_image } elseif ($p.image) { $p.image } else { '/assets/logo-512.png' }))
          head = "<script type=`"application/ld+json`">$(($ld | ConvertTo-Json -Compress -Depth 4).Replace('<', '<'))</script>" }
  [IO.File]::WriteAllText("$root\public\blog\$($p.slug).html", (Render $o (ArticleBody $p $live)), $utf8)
  $urls += "$site/blog/$($p.slug)"
  "built blog/$($p.slug).html"
}
foreach ($p in ($all | Where-Object { $live -notcontains $_ })) { "  not published yet: $($p.slug) ($(if ($p.published -eq $false) { 'unpublished' } else { "scheduled, $($p.date)" }))" }

$featured = $live | Where-Object { $_.featured -eq $true } | Select-Object -First 1
if (-not $featured) { $featured = $live | Select-Object -First 1 }
$tokens = [ordered]@{
  '{{posts}}' = ($live | ForEach-Object { Card $_ }) -join "`n"
  '{{latest}}' = ($live | Select-Object -First 3 | ForEach-Object { Card $_ }) -join "`n"
  '{{postlinks}}' = ($live | ForEach-Object { "        <a href=`"/blog/$($_.slug)`">$(Esc $_.title)</a>" }) -join "`n"
  '{{featured}}' = FeaturedCard $featured
  '{{postcount}}' = [string]$live.Count
}
Get-ChildItem "$root\src\pages\*.html" | Sort-Object Name | ForEach-Object {
  $s = ParsePage (ReadText $_.FullName)
  $name = $_.BaseName -replace '__', '/'
  $path = if ($name -eq 'index') { '/' } else { "/$name" }
  $outFile = "$root\public\$($name -replace '/', '\').html"
  New-Item -ItemType Directory -Force (Split-Path $outFile) | Out-Null
  $body = $s.body; foreach ($k in $tokens.Keys) { $body = $body.Replace($k, $tokens[$k]) }
  $o = @{ title = $s.meta.title; desc = $s.meta.desc; robots = $s.meta.robots; nav = $s.meta.nav; path = $path; page = ($_.BaseName -replace '__', '-'); head = ''; ogType = 'website'; ogImage = "$site/assets/logo-512.png" }
  [IO.File]::WriteAllText($outFile, (Render $o $body), $utf8)
  if ($s.meta.robots -notmatch 'noindex') { $urls += "$site$path" }
  "built $name.html"
}
$sitemap = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n<urlset xmlns=`"http://www.sitemaps.org/schemas/sitemap/0.9`">`n" + (($urls | ForEach-Object { "  <url><loc>$_</loc></url>" }) -join "`n") + "`n</urlset>`n"
[IO.File]::WriteAllText("$root\public\sitemap.xml", $sitemap, $utf8)
[IO.File]::WriteAllText("$root\public\robots.txt", "User-agent: *`nAllow: /`nDisallow: /admin`nDisallow: /cms`nDisallow: /api/`nSitemap: $site/sitemap.xml`n", $utf8)
$items = ($live | Select-Object -First 30 | ForEach-Object {
  "<item><title>$(Esc $_.title)</title><link>$site/blog/$($_.slug)</link><guid>$site/blog/$($_.slug)</guid><pubDate>$($_.dto.UtcDateTime.ToString('r', [Globalization.CultureInfo]::InvariantCulture))</pubDate><description>$(Esc $_.excerpt)</description></item>" }) -join "`n"
[IO.File]::WriteAllText("$root\public\blog\feed.xml", "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n<rss version=`"2.0`"><channel><title>Sociam blog</title><link>$site/blog</link><description>Industries, ideas, solutions, stories and news from Sociam.</description>`n$items`n</channel></rss>`n", $utf8)
"$($live.Count) live posts"
