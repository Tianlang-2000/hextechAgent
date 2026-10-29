// Only mark a line as verified when the entire model-provided text is present.
export function evidenceLocations(content: string, evidence: string[]): (number | null)[] {
  return evidence.map(item => {
    const text=item.trim()
    if (text.length < 4) return null
    const index=content.indexOf(text)
    return index < 0 ? null : content.slice(0,index).split('\n').length
  })
}
