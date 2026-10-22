import { contextBridge, ipcRenderer } from 'electron'
import type { AgentState, HextechAPI } from '../src/shared'
const api: HextechAPI = {
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
