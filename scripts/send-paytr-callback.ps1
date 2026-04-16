param(
  [Parameter(Mandatory = $true)]
  [string]$CallbackUrl,

  [Parameter(Mandatory = $true)]
  [string]$MerchantOid,

  [Parameter(Mandatory = $true)]
  [ValidateSet('success', 'failed')]
  [string]$Status,

  [Parameter(Mandatory = $true)]
  [int]$TotalAmount,

  [Parameter(Mandatory = $true)]
  [string]$MerchantKey,

  [Parameter(Mandatory = $true)]
  [string]$MerchantSalt,

  [string]$FailedReasonCode = '',
  [string]$FailedReasonMsg = ''
)

$hashInput = "$MerchantOid$MerchantSalt$Status$TotalAmount"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($MerchantKey)
$hashBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashInput))
$hash = [Convert]::ToBase64String($hashBytes)

$body = @{
  merchant_oid = $MerchantOid
  status = $Status
  total_amount = [string]$TotalAmount
  hash = $hash
}

if ($Status -eq 'failed') {
  $body.failed_reason_code = $FailedReasonCode
  $body.failed_reason_msg = $FailedReasonMsg
}

try {
  $response = Invoke-WebRequest -Uri $CallbackUrl -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded'
  Write-Host "StatusCode: $($response.StatusCode)"
  Write-Host "Response: $($response.Content)"
  Write-Host "Computed Hash: $hash"
}
catch {
  Write-Host "Callback request failed"
  Write-Host $_.Exception.Message
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    Write-Host "ResponseBody: $errorBody"
  }
  exit 1
}
