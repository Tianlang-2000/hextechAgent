import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { ReportStore } from '../electron/reports'
import { inside } from '../electron/policy'

test('report history persists independently, separates workspaces and skips damaged metadata', async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  try {
    const store=new ReportStore(base)
    const details={title:'处理超时',source:'src/api.ts',root:'workspace-a',mode:'codex' as const,write:false}
    const entry=await store.save('# 结果\n已完成检查',details)
    await store.save('演示',{...details,mode:'demo'})
    await store.save('其他目录',{...details,root:'workspace-b'})
    await writeFile(path.join(base,'report-bad.json'),'{')
    await writeFile(path.join(base,'report-abc.json'),JSON.stringify({...entry,id:'abc',file:'../outside.md'}))
    const restarted=new ReportStore(base)
    assert.deepEqual(await restarted.list(details.root,details.mode),[entry])
    assert.equal(await restarted.read(entry),'# 结果\n已完成检查')
    await assert.rejects(restarted.read({...entry,id:'../outside',file:'../outside.md'}),/无效/)
  } finally { assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true}) }
})
