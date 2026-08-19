import { describe, expect, it } from 'vitest'
import { FULL_DECK } from '@/engine'

describe('alias di percorso', () => {
  it('risolve @/ anche con un # nel percorso del progetto', () => {
    expect(FULL_DECK).toHaveLength(21)
  })
})
