import { contextBridge, ipcRenderer } from 'electron'
import type { AgentState, ConnectionState, HextechAPI, ModelCatalog } from '../src/shared'
const api: HextechAPI = {
  getModels: () => ipcRenderer.invoke('hextech:models'),
  onModels: callback => {
    const listener = (_event:unknown,catalog:ModelCatalog) => callback(catalog)
    ipcRenderer.on('hextech:models',listener)
    return () => ipcRenderer.removeListener('hextech:models',listener)
  },
  getConnection: () => ipcRenderer.invoke('hextech:connection'),
  onConnection: callback => {
    const listener = (_event: unknown,state: ConnectionState) => callback(state)
    ipcRenderer.on('hextech:connection',listener)
    return () => ipcRenderer.removeListener('hextech:connection',listener)
  },
  getState: () => ipcRenderer.invoke('hextech:state'),
  onState: callback => {
    const listener = (_event: unknown,state: AgentState) => callback(state)
    ipcRenderer.on('hextech:state',listener)
    return () => ipcRenderer.removeListener('hextech:state',listener)
  },
  action: (action,payload) => ipcRenderer.invoke('hextech:action',action,payload),
  chooseRoot: () => ipcRenderer.invoke('hextech:root'),
}
contextBridge.exposeInMainWorld('hextech',api)
