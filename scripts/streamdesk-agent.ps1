param(
  [string]$ServerUrl = $env:STREAMDESK_URL,
  [string]$AgentToken = $env:STREAMDESK_AGENT_TOKEN,
  [string]$DeviceType = $env:STREAMDESK_AGENT_TYPE,
  [string]$Location = $env:STREAMDESK_AGENT_LOCATION,
  [string]$VmixApiUrl = $env:STREAMDESK_VMIX_URL,
  [string]$CompanyId = $env:STREAMDESK_COMPANY_ID,
  [string]$WorkspaceKey = $env:STREAMDESK_WORKSPACE_KEY,
  [int]$IntervalSec = 0,
  [int]$HardwareIntervalSec = 0
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ServerUrl)) { $ServerUrl = "http://localhost:5000" }
if ([string]::IsNullOrWhiteSpace($DeviceType)) { $DeviceType = "computer" }
if ([string]::IsNullOrWhiteSpace($Location)) { $Location = "Auto agent" }
if ($IntervalSec -le 0) {
  if ($env:STREAMDESK_AGENT_INTERVAL_SEC) { $IntervalSec = [int]$env:STREAMDESK_AGENT_INTERVAL_SEC } else { $IntervalSec = 15 }
}
if ($IntervalSec -lt 5) { $IntervalSec = 5 }
if ($HardwareIntervalSec -le 0) {
  if ($env:STREAMDESK_AGENT_HARDWARE_INTERVAL_SEC) { $HardwareIntervalSec = [int]$env:STREAMDESK_AGENT_HARDWARE_INTERVAL_SEC } else { $HardwareIntervalSec = 1800 }
}
if ($HardwareIntervalSec -lt 300) { $HardwareIntervalSec = 300 }

$ServerUrl = $ServerUrl.TrimEnd("/")
$DeviceType = $DeviceType.ToLowerInvariant()
if ($DeviceType -notin @("computer", "server", "vmix")) { $DeviceType = "computer" }
if ([string]::IsNullOrWhiteSpace($VmixApiUrl) -and $DeviceType -eq "vmix") {
  $VmixApiUrl = "http://127.0.0.1:8088/api"
}

$script:Headers = @{}
if (-not [string]::IsNullOrWhiteSpace($AgentToken)) {
  $script:Headers["Authorization"] = "Bearer $AgentToken"
}

function Get-CimData {
  param(
    [string]$ClassName,
    [string]$Filter = ""
  )

  try {
    $params = @{
      ClassName = $ClassName
      ErrorAction = "Stop"
      OperationTimeoutSec = 4
    }
    if (-not [string]::IsNullOrWhiteSpace($Filter)) {
      $params["Filter"] = $Filter
    }
    return @(Get-CimInstance @params)
  } catch {
    try {
      $params = @{
        ClassName = $ClassName
        ErrorAction = "SilentlyContinue"
      }
      if (-not [string]::IsNullOrWhiteSpace($Filter)) {
        $params["Filter"] = $Filter
      }
      return @(Get-CimInstance @params)
    } catch {
      return @()
    }
  }
}

function Get-CimOne {
  param(
    [string]$ClassName,
    [string]$Filter = ""
  )

  $items = @(Get-CimData -ClassName $ClassName -Filter $Filter)
  if ($items.Count -gt 0) { return $items[0] }
  return $null
}

function New-AgentKey {
  try {
    $machineGuid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid -ErrorAction Stop).MachineGuid
  } catch {
    $machineGuid = $env:COMPUTERNAME
  }

  $source = "$env:COMPUTERNAME|$machineGuid"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($source)
  $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").Substring(0, 12).ToLowerInvariant()
  return "$env:COMPUTERNAME-$hash"
}

function Convert-ToIntOrNull([object]$Value) {
  try {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    return [int]$Value
  } catch {
    return $null
  }
}

function Get-LocalIps {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
      Select-Object -ExpandProperty IPAddress)
  } catch {
    try {
      return @([System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) |
        Where-Object { $_.AddressFamily -eq "InterNetwork" } |
        ForEach-Object { $_.IPAddressToString })
    } catch {
      return @()
    }
  }
}

$script:LastNetworkSample = $null
function Get-NetworkThroughput {
  try {
    $stats = @(Get-NetAdapterStatistics -ErrorAction Stop)
    $rx = [double](($stats | Measure-Object -Property ReceivedBytes -Sum).Sum)
    $tx = [double](($stats | Measure-Object -Property SentBytes -Sum).Sum)
    $now = Get-Date

    if ($null -eq $script:LastNetworkSample) {
      $script:LastNetworkSample = @{ Time = $now; Rx = $rx; Tx = $tx }
      return @{}
    }

    $seconds = [Math]::Max(1, ($now - $script:LastNetworkSample.Time).TotalSeconds)
    $rxMbps = [Math]::Round((($rx - $script:LastNetworkSample.Rx) * 8) / $seconds / 1MB, 2)
    $txMbps = [Math]::Round((($tx - $script:LastNetworkSample.Tx) * 8) / $seconds / 1MB, 2)
    $script:LastNetworkSample = @{ Time = $now; Rx = $rx; Tx = $tx }

    return @{
      networkRxMbps = [Math]::Max(0, $rxMbps)
      networkTxMbps = [Math]::Max(0, $txMbps)
    }
  } catch {
    return @{}
  }
}

function Get-CpuPercent {
  try {
    $perf = Get-CimOne -ClassName "Win32_PerfFormattedData_PerfOS_Processor" -Filter "Name='_Total'"
    if ($null -ne $perf -and $null -ne $perf.PercentProcessorTime) {
      return [Math]::Round([double]$perf.PercentProcessorTime, 1)
    }
  } catch {
  }

  try {
    $cpu = @(Get-CimData -ClassName "Win32_Processor")
    return [Math]::Round([double](($cpu | Measure-Object -Property LoadPercentage -Average).Average), 1)
  } catch {
    return $null
  }
}

function Get-SystemMetrics {
  $cpu = @(Get-CimData -ClassName "Win32_Processor")
  $os = Get-CimOne -ClassName "Win32_OperatingSystem"
  $drive = Get-CimOne -ClassName "Win32_LogicalDisk" -Filter "DeviceID='C:'"
  $cpuPercent = Get-CpuPercent
  $totalKb = if ($os) { [double]$os.TotalVisibleMemorySize } else { 0 }
  $freeKb = if ($os) { [double]$os.FreePhysicalMemory } else { 0 }
  $memoryPercent = if ($totalKb -gt 0) { [Math]::Round((($totalKb - $freeKb) / $totalKb) * 100, 1) } else { $null }
  $memoryUsedGb = if ($totalKb -gt 0) { [Math]::Round((($totalKb - $freeKb) * 1KB) / 1GB, 2) } else { $null }
  $memoryTotalGb = if ($totalKb -gt 0) { [Math]::Round(($totalKb * 1KB) / 1GB, 2) } else { $null }

  $diskPercent = $null
  $diskFreeGb = $null
  $diskTotalGb = $null
  if ($drive -and $drive.Size -gt 0) {
    $diskPercent = [Math]::Round((($drive.Size - $drive.FreeSpace) / $drive.Size) * 100, 1)
    $diskFreeGb = [Math]::Round($drive.FreeSpace / 1GB, 2)
    $diskTotalGb = [Math]::Round($drive.Size / 1GB, 2)
  }

  $boot = if ($os) { $os.LastBootUpTime } else { $null }
  $uptimeSec = if ($boot) { [int]((Get-Date) - $boot).TotalSeconds } else { $null }
  $net = Get-NetworkThroughput
  $processCount = try { @(Get-Process -ErrorAction SilentlyContinue).Count } catch { $null }

  $metrics = [ordered]@{
    cpuPercent = $cpuPercent
    cpuName = if ($cpu.Count -gt 0) { [string]$cpu[0].Name } else { "" }
    cpuCores = if ($cpu.Count -gt 0) { [int](($cpu | Measure-Object -Property NumberOfCores -Sum).Sum) } else { $null }
    cpuLogicalProcessors = if ($cpu.Count -gt 0) { [int](($cpu | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum) } else { $null }
    memoryPercent = $memoryPercent
    memoryUsedGb = $memoryUsedGb
    memoryTotalGb = $memoryTotalGb
    diskPercent = $diskPercent
    diskFreeGb = $diskFreeGb
    diskTotalGb = $diskTotalGb
    osCaption = $os.Caption
    uptimeSec = $uptimeSec
    processCount = $processCount
    sampleIntervalSec = $IntervalSec
    collectedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  foreach ($key in $net.Keys) {
    $metrics[$key] = $net[$key]
  }

  return $metrics
}

function Get-HardwareInventory {
  try {
    $baseBoard = Get-CimOne -ClassName "Win32_BaseBoard"
    $bios = Get-CimOne -ClassName "Win32_BIOS"
    $cpu = @(Get-CimData -ClassName "Win32_Processor")
    $ram = @(Get-CimData -ClassName "Win32_PhysicalMemory")
    $gpus = @(Get-CimData -ClassName "Win32_VideoController")
    $disks = @(Get-CimData -ClassName "Win32_DiskDrive")
    $netAdapters = @(Get-CimData -ClassName "Win32_NetworkAdapter" |
      Where-Object { $_.PhysicalAdapter -eq $true -and $_.Name })
    $pnp = @(Get-CimData -ClassName "Win32_PnPEntity" -Filter "PNPClass='Media' OR PNPClass='Image' OR PNPClass='Camera'")
    $capturePattern = "(?i)(capture|blackmagic|decklink|intensity|ultrastudio|aja|kona|magewell|elgato|avermedia|cam link|ndi|sdi|hdmi)"
    $captureDevices = @($pnp | Where-Object {
      ([string]$_.Name -match $capturePattern) -or ([string]$_.FriendlyName -match $capturePattern) -or ([string]$_.Manufacturer -match $capturePattern)
    })

    return [ordered]@{
      motherboard = [ordered]@{
        manufacturer = [string]$baseBoard.Manufacturer
        product = [string]$baseBoard.Product
        version = [string]$baseBoard.Version
        serialNumber = [string]$baseBoard.SerialNumber
      }
      bios = [ordered]@{
        manufacturer = [string]$bios.Manufacturer
        version = [string]$bios.SMBIOSBIOSVersion
        serialNumber = [string]$bios.SerialNumber
        releaseDate = if ($bios.ReleaseDate) { ([datetime]$bios.ReleaseDate).ToUniversalTime().ToString("o") } else { "" }
      }
      processors = @($cpu | ForEach-Object {
        [ordered]@{
          name = [string]$_.Name
          manufacturer = [string]$_.Manufacturer
          cores = [int]$_.NumberOfCores
          logicalProcessors = [int]$_.NumberOfLogicalProcessors
          maxClockMhz = [int]$_.MaxClockSpeed
        }
      })
      ramModules = @($ram | ForEach-Object {
        [ordered]@{
          bank = [string]$_.BankLabel
          slot = [string]$_.DeviceLocator
          manufacturer = [string]$_.Manufacturer
          partNumber = ([string]$_.PartNumber).Trim()
          serialNumber = [string]$_.SerialNumber
          capacityGb = if ($_.Capacity) { [Math]::Round(([double]$_.Capacity) / 1GB, 2) } else { $null }
          speedMhz = Convert-ToIntOrNull $_.Speed
        }
      })
      gpuDevices = @($gpus | ForEach-Object {
        [ordered]@{
          name = [string]$_.Name
          driverVersion = [string]$_.DriverVersion
          adapterRamGb = if ($_.AdapterRAM) { [Math]::Round(([double]$_.AdapterRAM) / 1GB, 2) } else { $null }
        }
      })
      captureDevices = @($captureDevices | Select-Object -First 20 | ForEach-Object {
        $captureName = if ($_.Name) { [string]$_.Name } else { [string]$_.FriendlyName }
        $captureId = if ($_.DeviceID) { [string]$_.DeviceID } else { [string]$_.InstanceId }
        [ordered]@{
          name = $captureName
          manufacturer = [string]$_.Manufacturer
          deviceId = $captureId
          status = [string]$_.Status
        }
      })
      disks = @($disks | ForEach-Object {
        [ordered]@{
          model = [string]$_.Model
          interfaceType = [string]$_.InterfaceType
          serialNumber = [string]$_.SerialNumber
          sizeGb = if ($_.Size) { [Math]::Round(([double]$_.Size) / 1GB, 2) } else { $null }
          mediaType = [string]$_.MediaType
        }
      })
      networkAdapters = @($netAdapters | Select-Object -First 20 | ForEach-Object {
        [ordered]@{
          name = [string]$_.Name
          macAddress = [string]$_.MACAddress
          speedMbps = if ($_.Speed) { [Math]::Round(([double]$_.Speed) / 1000000, 0) } else { $null }
          adapterType = [string]$_.AdapterType
        }
      })
      collectedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  } catch {
    return [ordered]@{
      error = $_.Exception.Message
      collectedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  }
}

function Get-VmixStatus {
  if ([string]::IsNullOrWhiteSpace($VmixApiUrl)) {
    return @{ enabled = $false; connected = $false }
  }

  try {
    $response = Invoke-WebRequest -Uri $VmixApiUrl -UseBasicParsing -TimeoutSec 3
    [xml]$xml = $response.Content
    $inputs = @()
    foreach ($node in @($xml.vmix.inputs.input) | Select-Object -First 30) {
      if ($null -ne $node) {
        $inputs += @{
          number = Convert-ToIntOrNull $node.number
          title = [string]$node.title
          type = [string]$node.type
          state = [string]$node.state
        }
      }
    }

    $dropStats = @()
    $matches = [regex]::Matches([string]$response.Content, '(?i)(sourceDropped|rendererDropped|droppedFrames|dropped|resync)[^0-9]{0,20}([0-9]+)')
    foreach ($match in $matches) {
      $dropStats += @{
        name = $match.Groups[1].Value
        value = [int]$match.Groups[2].Value
      }
    }

    $dropTotal = $null
    if ($dropStats.Count -gt 0) {
      $dropTotal = [int](($dropStats | Measure-Object -Property value -Sum).Sum)
    }

    return [ordered]@{
      enabled = $true
      connected = $true
      version = [string]$xml.vmix.version
      streaming = ([string]$xml.vmix.streaming -eq "True")
      recording = ([string]$xml.vmix.recording -eq "True")
      external = ([string]$xml.vmix.external -eq "True")
      preview = Convert-ToIntOrNull $xml.vmix.preview
      active = Convert-ToIntOrNull $xml.vmix.active
      fps = Convert-ToIntOrNull $xml.vmix.fps
      inputs = $inputs
      inputCount = $inputs.Count
      dropStats = $dropStats
      droppedFramesTotal = $dropTotal
      rawStatsAvailable = ($dropStats.Count -gt 0)
      checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  } catch {
    return [ordered]@{
      enabled = $true
      connected = $false
      error = $_.Exception.Message
      checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  }
}

function Invoke-StreamDeskJson {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [int]$TimeoutSec = 15
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $script:Headers
    TimeoutSec = $TimeoutSec
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json; charset=utf-8"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 16 -Compress)
  }

  return Invoke-RestMethod @params
}

function Invoke-VmixFunction {
  param(
    [string]$Function,
    [string]$InputValue = ""
  )

  if ([string]::IsNullOrWhiteSpace($VmixApiUrl)) {
    throw "STREAMDESK_VMIX_URL is empty"
  }

  $separator = if ($VmixApiUrl.Contains("?")) { "&" } else { "?" }
  $uri = "$VmixApiUrl$separator" + "Function=$([System.Uri]::EscapeDataString($Function))"
  if (-not [string]::IsNullOrWhiteSpace($InputValue)) {
    $uri += "&Input=$([System.Uri]::EscapeDataString($InputValue))"
  }
  Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 10 | Out-Null
}

function Invoke-VmixScheduleEvent {
  param([object]$Event)

  $actions = @($Event.actions)
  $hasPreviewAction = $false

  if (-not [string]::IsNullOrWhiteSpace([string]$Event.input)) {
    $hasPreviewAction = ($actions | Where-Object { $_ -match '^PreviewInput' }).Count -gt 0
    if (-not $hasPreviewAction) {
      Invoke-VmixFunction -Function "PreviewInput" -InputValue ([string]$Event.input)
      Start-Sleep -Milliseconds 300
    }
  }

  foreach ($action in $actions) {
    $name = [string]$action
    if ([string]::IsNullOrWhiteSpace($name)) { continue }

    if ($name -match '^PreviewInput(.+)$') {
      Invoke-VmixFunction -Function "PreviewInput" -InputValue $Matches[1]
    } else {
      Invoke-VmixFunction -Function $name
    }
    Start-Sleep -Milliseconds 300
  }
}

function Send-SchedulerResult {
  param(
    [string]$EventId,
    [string]$Status,
    [string]$Message = ""
  )

  $body = @{
    agentKey = $script:AgentKey
    companyId = $CompanyId
    workspaceKey = $WorkspaceKey
    status = $Status
    message = $Message
    executedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Invoke-StreamDeskJson -Method "POST" -Uri "$ServerUrl/api/agents/vmix-scheduler/$EventId/result" -Body $body -TimeoutSec 10 | Out-Null
}

function Receive-DueVmixEvents {
  if ($DeviceType -ne "vmix") { return }

  $encodedAgent = [System.Uri]::EscapeDataString($script:AgentKey)
  $encodedName = [System.Uri]::EscapeDataString($env:COMPUTERNAME)
  $encodedCompanyId = [System.Uri]::EscapeDataString($CompanyId)
  $encodedWorkspaceKey = [System.Uri]::EscapeDataString($WorkspaceKey)
  $lookAhead = [Math]::Max($IntervalSec + 3, 10)
  $response = Invoke-StreamDeskJson -Method "GET" -Uri "$ServerUrl/api/agents/$encodedAgent/vmix-scheduler/due?lookAheadSec=$lookAhead&name=$encodedName&global=true&companyId=$encodedCompanyId&workspaceKey=$encodedWorkspaceKey" -TimeoutSec 10

  foreach ($event in @($response.events)) {
    try {
      Write-Host ("Executing vMix schedule: {0}" -f $event.title)
      Invoke-VmixScheduleEvent -Event $event
      Send-SchedulerResult -EventId $event.id -Status "completed" -Message "Executed by StreamDesk Agent"
    } catch {
      $message = $_.Exception.Message
      Write-Warning ("vMix schedule failed: {0}" -f $message)
      Send-SchedulerResult -EventId $event.id -Status "error" -Message $message
    }
  }
}

$script:AgentKey = if ($env:STREAMDESK_AGENT_KEY) { $env:STREAMDESK_AGENT_KEY } else { New-AgentKey }
$script:HeartbeatCount = 0
$script:LastHardwareAt = $null
$script:HardwareCache = $null

function Get-DueHardwareInventory {
  if ($script:HeartbeatCount -le 0) {
    return $null
  }

  $now = Get-Date
  $isDue = $null -eq $script:LastHardwareAt -or (($now - $script:LastHardwareAt).TotalSeconds -ge $HardwareIntervalSec)
  if (-not $isDue) {
    return $null
  }

  $script:LastHardwareAt = $now
  $script:HardwareCache = Get-HardwareInventory
  return $script:HardwareCache
}

Write-Host "StreamDesk Agent"
Write-Host "CRM: $ServerUrl"
Write-Host "Type: $DeviceType"
Write-Host "Agent: $script:AgentKey"
if (-not [string]::IsNullOrWhiteSpace($CompanyId)) { Write-Host "Company: $CompanyId" }
if ($DeviceType -eq "vmix") { Write-Host "vMix API: $VmixApiUrl" }
Write-Host "Interval: $IntervalSec sec"
Write-Host "Hardware interval: $HardwareIntervalSec sec"
Write-Host ""

while ($true) {
  try {
    $ips = @(Get-LocalIps)
    $metrics = Get-SystemMetrics
    $hardware = Get-DueHardwareInventory
    $vmix = if ($DeviceType -eq "vmix" -or -not [string]::IsNullOrWhiteSpace($VmixApiUrl)) { Get-VmixStatus } else { @{ enabled = $false; connected = $false } }

    $payload = [ordered]@{
      agentKey = $script:AgentKey
      name = $env:COMPUTERNAME
      hostname = $env:COMPUTERNAME
      type = $DeviceType
      location = $Location
      companyId = $CompanyId
      workspaceKey = $WorkspaceKey
      ipAddress = if ($ips.Count -gt 0) { $ips[0] } else { "" }
      localIps = $ips
      version = "1.0.0"
      intervalSec = $IntervalSec
      capabilities = if ($DeviceType -eq "vmix") { @("monitoring", "vmix", "vmix-scheduler") } else { @("monitoring") }
      metrics = $metrics
      vmix = $vmix
    }
    if ($null -ne $hardware) {
      $payload["hardware"] = $hardware
    }

    Invoke-StreamDeskJson -Method "POST" -Uri "$ServerUrl/api/agents/heartbeat" -Body $payload -TimeoutSec 15 | Out-Null
    $script:HeartbeatCount += 1
    Receive-DueVmixEvents

    $vmixState = if ($vmix.enabled) { if ($vmix.connected) { "vMix=online" } else { "vMix=offline" } } else { "vMix=off" }
    $hardwareState = if ($null -ne $hardware) { "hardware=sent" } else { "hardware=skip" }
    Write-Host ("[{0}] heartbeat OK cpu={1}% mem={2}% disk={3}% {4} {5}" -f (Get-Date -Format "HH:mm:ss"), $metrics.cpuPercent, $metrics.memoryPercent, $metrics.diskPercent, $vmixState, $hardwareState)
  } catch {
    Write-Warning ("heartbeat failed: {0}" -f $_.Exception.Message)
  }

  Start-Sleep -Seconds $IntervalSec
}
