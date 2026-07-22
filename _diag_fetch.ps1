$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "rep@luxesupply.co"; password = "luxe2026"; next = "/wholesaleportal/rep/clients/I8Ess3mlSKnjCdIaUUMw" }
$login = Invoke-WebRequest -Uri "http://localhost:3000/api/login" -Method POST -Body $body -WebSession $session -MaximumRedirection 0 -SkipHttpErrorCheck -UseBasicParsing
Write-Host "LoginStatus: $($login.StatusCode)"
Write-Host "Location: $($login.Headers.Location)"
$page = Invoke-WebRequest -Uri "http://localhost:3000/wholesaleportal/rep/clients/I8Ess3mlSKnjCdIaUUMw" -WebSession $session -SkipHttpErrorCheck -UseBasicParsing
Write-Host "PageStatus: $($page.StatusCode)"
Write-Host "Length: $($page.RawContentLength)"
$page.Content | Out-File -FilePath "c:\IIQ-PhotoApp-Frontend\luxe-supply-wholesale\_page_sample.html" -Encoding utf8

$chunkMatches = [regex]::Matches($page.Content, '_next/static/chunks/[^\s"<>]+')
$chunks = $chunkMatches | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Host "ChunkCount: $($chunks.Count)"
$chunks | Select-Object -First 50 | ForEach-Object { Write-Host $_ }

$headers = @{ "RSC"="1"; "Accept"="text/x-component" }
$rsc = Invoke-WebRequest -Uri "http://localhost:3000/wholesaleportal/rep/clients/I8Ess3mlSKnjCdIaUUMw" -WebSession $session -Headers $headers -SkipHttpErrorCheck -UseBasicParsing
Write-Host "RSCStatus: $($rsc.StatusCode)"
Write-Host "RSCLength: $($rsc.RawContentLength)"
$rsc.Content | Out-File -FilePath "c:\IIQ-PhotoApp-Frontend\luxe-supply-wholesale\_rsc_sample.txt" -Encoding utf8
Write-Host "Saved RSC sample"

# Soft-nav style flight with Next-Url
$headers2 = @{
  "RSC"="1"
  "Next-Url"="/wholesaleportal/rep/clients"
  "Accept"="text/x-component"
}
$rsc2 = Invoke-WebRequest -Uri "http://localhost:3000/wholesaleportal/rep/clients/I8Ess3mlSKnjCdIaUUMw?_rsc=diag" -WebSession $session -Headers $headers2 -SkipHttpErrorCheck -UseBasicParsing
Write-Host "SoftRSCStatus: $($rsc2.StatusCode)"
$rsc2.Content | Out-File -FilePath "c:\IIQ-PhotoApp-Frontend\luxe-supply-wholesale\_rsc_soft.txt" -Encoding utf8
