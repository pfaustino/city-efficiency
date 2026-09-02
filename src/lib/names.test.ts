import { describe, expect, it } from 'vitest'
import { censusPlaceToCityName, dojAgencyToCityName, slugify } from './names.ts'

describe('name matching', () => {
  it('slugifies SCO city names', () => {
    expect(slugify('San Luis Obispo')).toBe('san-luis-obispo')
  })

  it('maps Census Ventura and Paso Robles labels', () => {
    expect(censusPlaceToCityName('San Buenaventura (Ventura) city, California')).toBe('ventura')
    expect(censusPlaceToCityName('El Paso de Robles (Paso Robles) city, California')).toBe(
      'paso robles',
    )
  })

  it('drops sheriff and campus agencies', () => {
    expect(dojAgencyToCityName('Burbank')).toBe('burbank')
    expect(dojAgencyToCityName("Los Angeles Co. Sheriff's Department")).toBeNull()
    expect(dojAgencyToCityName('UC Berkeley')).toBeNull()
  })
})
