// 演示素材：故意保留失败处理问题。
export async function loadTasks() {
  const response = await fetch('/api/tasks')
  return response.json()
}
