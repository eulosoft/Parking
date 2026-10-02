$ErrorActionPreference = 'Stop'

$javaVersion = & java -version 2>&1 | Out-String
if ($javaVersion -notmatch 'version "17\.') {
  throw 'Android release builds require JDK 17 on PATH.'
}

$signingDirectory = Join-Path $HOME '.parking-release'
$keystorePath = Join-Path $signingDirectory 'parking-upload.p12'
$protectedPasswordPath = Join-Path $signingDirectory 'password.dpapi'

if (!(Test-Path -LiteralPath $keystorePath) -or !(Test-Path -LiteralPath $protectedPasswordPath)) {
  throw "Signing files are missing from $signingDirectory."
}

$securePassword = Get-Content -LiteralPath $protectedPasswordPath | ConvertTo-SecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:ANDROID_UPLOAD_STORE_FILE = $keystorePath
  $env:ANDROID_UPLOAD_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:ANDROID_UPLOAD_KEY_ALIAS = 'parking-release'
  $env:ANDROID_UPLOAD_KEY_PASSWORD = $env:ANDROID_UPLOAD_STORE_PASSWORD

  Push-Location $PSScriptRoot
  try {
    & .\gradlew.bat :app:assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle release build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  $env:ANDROID_UPLOAD_STORE_FILE = $null
  $env:ANDROID_UPLOAD_STORE_PASSWORD = $null
  $env:ANDROID_UPLOAD_KEY_ALIAS = $null
  $env:ANDROID_UPLOAD_KEY_PASSWORD = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
