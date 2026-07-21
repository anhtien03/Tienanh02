const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readData: () => ipcRenderer.invoke('read-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportCSV: (options) => ipcRenderer.invoke('export-csv', options),
  onDataUpdated: (callback) => ipcRenderer.on('data-updated', callback)
});
