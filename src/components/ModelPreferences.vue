<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw, LoaderCircle, Sparkles, Zap } from '@lucide/vue'
import type { ModelCatalog } from '../shared'
import { effortLabel, speedLabel, supportsEffort, supportsTier } from '../generation-options'
const props=defineProps<{catalog:ModelCatalog;model:string;effort:string;tier:string;disabled:boolean}>()
const emit=defineEmits<{ 'update:model':[value:string]; 'update:effort':[value:string]; 'update:tier':[value:string]; refresh:[] }>()
const active=computed(()=>props.catalog.models.find(m=>m.model===props.model))
const modelMissing=computed(()=>!!props.model&&!active.value)
const effortInvalid=computed(()=>!supportsEffort(active.value,props.effort))
const tierInvalid=computed(()=>!supportsTier(active.value,props.tier))
function changeModel(event:Event) {
  const model=(event.target as HTMLSelectElement).value
  const next=props.catalog.models.find(m=>m.model===model)
  emit('update:model',model)
  if(!supportsEffort(next,props.effort))emit('update:effort','')
  if(!supportsTier(next,props.tier))emit('update:tier','')
}
function reset() { emit('update:model',''); emit('update:effort',''); emit('update:tier','') }
</script>
<template>
  <section class="model-preferences" aria-label="模型与推理设置">
    <div class="preference-heading"><strong><Sparkles :size="15"/>模型与推理</strong><div class="preference-tools"><button type="button" :disabled="disabled" @click="reset">恢复默认</button><button type="button" data-testid="models-refresh" :disabled="disabled||catalog.status==='loading'" @click="emit('refresh')"><LoaderCircle v-if="catalog.status==='loading'" class="spin" :size="13"/><RefreshCw v-else :size="13"/>刷新列表</button></div></div>
    <label for="generation-model">模型<span>从当前连接读取</span></label>
    <select id="generation-model" data-testid="model-select" :value="model" :disabled="disabled||catalog.status==='loading'" @change="changeModel"><option value="">跟随连接配置</option><option v-if="modelMissing" :value="model">已保存：{{model}}（未在目录中找到）</option><option v-for="item in catalog.models" :key="item.model" :value="item.model">{{ item.name }}{{ item.isDefault?' · 默认推荐':'' }}</option></select>
    <p v-if="active" class="model-description">{{active.description}}</p>
    <div class="generation-grid"><div><label for="generation-effort">推理强度</label><select id="generation-effort" data-testid="effort-select" :value="effort" :disabled="disabled||!active" @change="emit('update:effort',($event.target as HTMLSelectElement).value)"><option value="">跟随连接配置</option><option v-if="effortInvalid" :value="effort">已保存：{{effort}}（不受支持）</option><option v-for="item in active?.efforts||[]" :key="item.id" :value="item.id">{{effortLabel(item.id)}}</option></select></div><div><label for="generation-speed">响应速度</label><select id="generation-speed" data-testid="speed-select" :value="tier" :disabled="disabled" @change="emit('update:tier',($event.target as HTMLSelectElement).value)"><option value="">跟随连接配置</option><option value="default">标准速度</option><option v-if="tierInvalid" :value="tier">已保存：{{tier}}（不受支持）</option><option v-for="item in active?.tiers||[]" :key="item.id" :value="item.id">{{speedLabel(item.id,item.name)}}</option></select></div></div>
    <p v-if="!model" class="preference-note">选择具体模型后，可以调整它支持的推理档位和加速模式。</p>
    <p v-else-if="effort" class="preference-note">{{effort==='ultra'?'极致推理可能包含自动任务拆分；耗时和额度使用会增加。':'推理越深入，通常需要更多时间和额度。'}}</p>
    <p v-if="tier&&tier!=='default'" class="preference-note speed-notice"><Zap :size="12"/>加速或其他服务档位可能消耗不同额度；实际速度和可用性以账号及服务为准。</p>
    <p v-if="catalog.status==='error'" class="preference-error" role="alert">无法刷新模型：{{catalog.error}}。已保存的选择仍会保留，可重新刷新。</p>
    <p v-else-if="catalog.status==='ready'&&!catalog.models.length" class="preference-note">当前连接没有返回模型，请重新检查连接或刷新。</p>
    <p v-if="catalog.status==='ready'&&(modelMissing||effortInvalid||tierInvalid)" class="preference-error" role="alert">已保存的选项不在当前模型支持范围内，请重新选择后保存。</p>
    <p class="preference-footnote">列表来自连接组件，不代表所有模型都已获得账号使用权限。</p>
  </section>
</template>
