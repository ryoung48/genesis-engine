import { MATH } from '../../../../utilities/math'
import { CLUSTER } from '../clusters'
import { Language, PhonemeCatalog } from '../types'

interface CustomClusterParams {
  len?: number
  long_names?: number
  structures?: {
    [PhonemeCatalog.MIDDLE_CONSONANT]: string
    [PhonemeCatalog.MIDDLE_VOWEL]: string
  }
}

/**
 * filters terms that fall in the given set of letters
 * @param prospects
 * @param letters
 * @returns list prospects that pass
 */
export const validTerms = (prospects: string[], letters: string[]) =>
  prospects.filter(c => c.split('').every(l => letters.includes(l)))

export const randomizePhonemes = (src: Language) => {
  Object.entries(src.basePhonemes).forEach(([k, v]) => {
    const condensed = new Map<string, number>()
    v.forEach(c => {
      condensed.set(c, (condensed.get(c) || 0) + src.dice.random)
    })
    src.phonemes[k as PhonemeCatalog] = MATH.buildDistribution(
      Array.from(condensed, ([v, w]) => ({ v, w })),
      1
    )
  })
}

export const initClusters = (params: {
  src: Language
  shortFirst?: boolean
  shortSurnames?: boolean
  clusters?: Record<string, CustomClusterParams>
}) => {
  const { src, shortSurnames, shortFirst, clusters } = params
  const { ending, surnames } = src

  // Syllable weight drives base length and how often names get an extra syllable
  const sw = src.syllableWeight
  const baseLen   = sw === 'light' ? 1 : 2
  const lnMult    = sw === 'light' ? 0.3 : sw === 'heavy' ? 1.5 : 1.0
  const regionLen = sw === 'heavy' ? 3 : baseLen

  src.clusters = {
    settlement: CLUSTER.spawn({
      src: src,
      key: 'settlement',
      ending,
      stopChance: src.articleChance,
      variation: 15,
      len: baseLen,
      longNames: 0.5 * lnMult
    }),
    wilderness: CLUSTER.spawn({
      src: src,
      key: 'wilderness',
      ending,
      stopChance: src.articleChance,
      variation: 15,
      len: baseLen,
      longNames: 0.5 * lnMult
    }),
    region: CLUSTER.spawn({
      src: src,
      key: 'region',
      ending,
      stopChance: src.articleChance,
      variation: 15,
      len: regionLen,
      longNames: 1 * lnMult
    }),
    culture: CLUSTER.spawn({
      src: src,
      key: 'culture',
      ending,
      stopChance: 0,
      variation: 15,
      len: regionLen,
      longNames: 1 * lnMult
    }),
    male: CLUSTER.spawn({
      src: src,
      key: 'male',
      ending,
      stopChance: src.stopChance,
      len: shortFirst ? 1 : clusters?.male?.len,
      longNames: (clusters?.male?.long_names ?? 0.3) * lnMult,
      variation: 15
    }),
    female: CLUSTER.spawn({
      src: src,
      key: 'female',
      ending: PhonemeCatalog.MIDDLE_VOWEL,
      stopChance: src.stopChance,
      variation: 15,
      len: shortFirst ? 1 : clusters?.female?.len,
      longNames: (clusters?.female?.long_names ?? 0) * lnMult
    }),
    last: CLUSTER.spawn({
      src: src,
      key: 'last',
      variation: 15,
      ending,
      stopChance: 0,
      longNames: clusters?.last?.long_names || 0,
      len: clusters?.last?.len || (shortSurnames ? 1 : surnames.epithets.length > 0 ? 2 : 3)
    })
  }
  // similar first names
  src.clusters.female.patterns = src.clusters.male.patterns
}
