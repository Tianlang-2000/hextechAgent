const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..')
  const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8')
  const window = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, sandbox: true } })
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html style="margin:0;background:transparent"><body style="margin:0">${svg}</body></html>`))
  await new Promise(resolve => setTimeout(resolve, 300))
  const picture = (await window.webContents.capturePage()).resize({ width: 256, height: 256 })
  fs.writeFileSync(path.join(root,'build/icon.png'),picture.toPNG())
  const sizes=[16,24,32,48,64,128,256]
  const pngs=sizes.map(size=>nativeImage.createFromBuffer(picture.toPNG()).resize({width:size,height:size}).toPNG())
  const header=Buffer.alloc(6+sizes.length*16); header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4)
  let offset=header.length
  pngs.forEach((png,i)=>{ const at=6+i*16; header[at]=header[at+1]=sizes[i]===256?0:sizes[i]; header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length })
  fs.writeFileSync(path.join(root,'build/icon.ico'),Buffer.concat([header,...pngs]))
  app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
