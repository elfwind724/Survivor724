import { describe, expect, it } from 'vitest'
import { ASSET_INDEX } from '@/data/assetIndex'
import { isEditableTarget, matchesCreativeQuery } from '@/ui/CreativeEditor'

describe('creative editor search', () => {
  it('does not treat opening the panel as a search query', () => {
    const husky = ASSET_INDEX.find((entry) => entry.name === 'Husky')
    expect(husky).toBeTruthy()
    if (!husky) throw new Error('missing husky')
    expect(matchesCreativeQuery(husky, '')).toBe(true)
    expect(matchesCreativeQuery({ name: 'Husky', id: 'husky' }, 'i')).toBe(false)
    expect(matchesCreativeQuery(husky, 'husk')).toBe(true)
    expect(ASSET_INDEX.filter((entry) => matchesCreativeQuery(entry, 'zzzz-no-such'))).toHaveLength(0)
  })

  it('lets I type into a search field but not steal game keys from empty document', () => {
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'BUTTON', isContentEditable: false })).toBe(false)
  })
})
