$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $branches = @(git for-each-ref --format='%(refname:short)' refs/heads/)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect local branches.' }
    if ($branches.Count -ne 1 -or $branches[0] -ne 'main') {
        throw 'Exactly one local branch named main is required.'
    }

    $tracked = @(git ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files.' }
    $forbidden = @($tracked | Where-Object {
        $_ -match '(^|/)(node_modules|dist|build|coverage|artifacts)/' -or
        ($_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '(^|/)\.env\.example$') -or
        $_ -match '\.(pem|key|p12|sqlite|sqlite3|db)$'
    })
    if ($forbidden.Count -gt 0) { throw "Forbidden tracked paths: $($forbidden -join ', ')" }

    $archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ('carerelay-' + [guid]::NewGuid().ToString('N') + '.zip')
    try {
        git archive --format=zip --output=$archivePath HEAD
        if ($LASTEXITCODE -ne 0) { throw 'Commit the foundation before checking archive size.' }
        $archiveBytes = (Get-Item -LiteralPath $archivePath).Length
        if ($archiveBytes -ge 9000000) { throw 'Source archive exceeds the 9 MB safety budget.' }
        Write-Output "Committed source archive: $archiveBytes bytes (budget: under 9,000,000)."
    } finally {
        if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
    }

    $gitPath = git rev-parse --absolute-git-dir
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve Git storage.' }
    $gitBytes = (Get-ChildItem -LiteralPath $gitPath -File -Recurse | Measure-Object -Property Length -Sum).Sum
    if ($gitBytes -ge 9000000) { throw 'Git storage exceeds the 9 MB safety budget.' }
    Write-Output "Git storage: $gitBytes bytes."

    $remotes = @(git remote)
    if ($remotes -contains 'origin') {
        $heads = @(git ls-remote --heads origin)
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify remote heads.' }
        if ($heads.Count -ne 1 -or $heads[0] -notmatch '\srefs/heads/main$') {
            throw 'Origin must have exactly one branch named main.'
        }
        Write-Output 'Remote branch check passed.'
    } else {
        Write-Warning 'No origin configured. Public visibility and remote branch count are not verified.'
    }
    Write-Output 'Local repository checks passed. This is not an application security scan.'
} finally {
    Pop-Location
}

