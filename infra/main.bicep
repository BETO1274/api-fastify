// Infraestructura de Azure para api-fastify (fase 2 — multicloud).
// Recrea exactamente lo que se armó manualmente en el portal:
// PostgreSQL Flexible Server (tier gratis) + AKS (2 nodos, monitoreo nativo).
//
// Desplegar:
//   az deployment group create --resource-group DEVOPS --template-file infra/main.bicep --parameters postgresAdminPassword='TU_PASSWORD'
//
// Destruir todo (cuidado, es irreversible):
//   az group delete --name DEVOPS --yes

@description('Región de todos los recursos')
param location string = 'westus'

@description('Nombre del servidor de PostgreSQL (debe ser único globalmente)')
param postgresServerName string = 'devops1274'

@description('Usuario administrador de PostgreSQL')
param postgresAdminUser string = 'apiadmin'

@description('Password del administrador de PostgreSQL (nunca lo pases hardcodeado, usa --parameters en el comando)')
@secure()
param postgresAdminPassword string

@description('Nombre del clúster AKS')
param aksClusterName string = 'kubernet-devops'

@description('Cantidad de nodos del node pool')
param aksNodeCount int = 2

@description('Tamaño de VM de los nodos (x64, no ARM — compatible con la imagen Docker)')
param aksNodeVmSize string = 'Standard_D2s_v6'

@description('DNS prefix del clúster AKS')
param aksDnsPrefix string = 'kubernet-devops-dns'

// ── Log Analytics Workspace (para Container Insights / logs de los pods) ──
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'DefaultWorkspace-${uniqueString(resourceGroup().id)}-${location}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Azure Monitor Workspace (para Prometheus administrado) ──
resource monitorWorkspace 'Microsoft.Monitor/accounts@2023-04-03' = {
  name: 'defaultazuremonitorworkspace-wus'
  location: location
}

// ── Azure Database for PostgreSQL Flexible Server (tier gratis) ──
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Regla de firewall: acceso público desde cualquier IP (GitHub Actions, Render,
// AKS y quien administre no tienen IP de salida fija — ver credentials.local.md).
resource postgresFirewallAllowAll 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgresServer
  name: 'AllowAll'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// ── AKS ──
resource aks 'Microsoft.ContainerService/managedClusters@2024-05-01' = {
  name: aksClusterName
  location: location
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: aksDnsPrefix
    agentPoolProfiles: [
      {
        name: 'agentpool'
        mode: 'System'
        count: aksNodeCount
        vmSize: aksNodeVmSize
        osType: 'Linux'
        osSKU: 'Ubuntu'
        type: 'VirtualMachineScaleSets'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      loadBalancerSku: 'Standard'
    }
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
      imageCleaner: {
        enabled: true
        intervalHours: 168
      }
    }
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalytics.id
        }
      }
    }
    azureMonitorProfile: {
      metrics: {
        enabled: true
      }
    }
  }
}

output aksNombre string = aks.name
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
