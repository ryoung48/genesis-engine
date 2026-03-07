import { Gender } from '../../types'
import { Dice } from '../../../utilities/dice'
import { TEXT } from '../../../utilities/text'
import { initClusters, randomizePhonemes } from './builder'
import { buildConsonants } from './builder/consonants'
import { buildBasicVowels, buildComplexVowels } from './builder/vowels'
import { CLUSTER } from './clusters'
import {
  Language,
  OrthoStyle,
  PhonemeClass,
  PhonemeCatalog,
  SyllableWeight,
  WordParams
} from './types'

const spawn = (dice: Dice) => {
  const lang: Language = {
    dice,
    stop: ' ',
    stopChance: 0,
    basePhonemes: {
      [PhonemeCatalog.START_CONSONANT]: [],
      [PhonemeCatalog.MIDDLE_CONSONANT]: [],
      [PhonemeCatalog.END_CONSONANT]: [],
      [PhonemeCatalog.START_VOWEL]: [],
      [PhonemeCatalog.FRONT_VOWEL]: [],
      [PhonemeCatalog.MIDDLE_VOWEL]: [],
      [PhonemeCatalog.BACK_VOWEL]: [],
      [PhonemeCatalog.END_VOWEL]: []
    },
    phonemes: {
      [PhonemeCatalog.START_CONSONANT]: [],
      [PhonemeCatalog.MIDDLE_CONSONANT]: [],
      [PhonemeCatalog.END_CONSONANT]: [],
      [PhonemeCatalog.START_VOWEL]: [],
      [PhonemeCatalog.FRONT_VOWEL]: [],
      [PhonemeCatalog.MIDDLE_VOWEL]: [],
      [PhonemeCatalog.BACK_VOWEL]: [],
      [PhonemeCatalog.END_VOWEL]: []
    },
    vowels: [],
    diphthongs: [],
    digraphs: [],
    clusters: {},
    ending:
      dice.random > 0.3 ? PhonemeCatalog.MIDDLE_CONSONANT : PhonemeCatalog.MIDDLE_VOWEL,
    consonantChance: dice.uniform(0.1, 0.4),
    surnames: {
      patronymic: false,
      suffix: {
        male: [''],
        female: ['']
      },
      epithets: []
    },
    articleChance: dice.uniform(0, 0.05),
    predefined: {},
    phonemeClass: 'nasal' as PhonemeClass,
    syllableWeight: 'medium' as SyllableWeight,
    orthoStyle: 'standard' as OrthoStyle
  }
  return lang
}

const baseVowels = ['a', 'e', 'i', 'o', 'u', 'y']

const _unique_names = new Set<string>()

export const LANGUAGE = {
  word: {
    demonym: (lang: Language) => {
      const { morphemes } = LANGUAGE.word.unique({ lang, key: 'culture' })
      const prefix = morphemes.slice(0, lang.dice.choice([2, 3])).join('')
      let index = prefix.length - 1
      while (index >= 0 && CLUSTER.vowel(prefix[index])) {
        index--
      }
      const cleaned = prefix.slice(0, index + 1)
      const suffix = lang.dice.weightedChoice([
        { v: 'an', w: cleaned.includes('n') ? 0 : 1 },
        { v: 'ian', w: cleaned.includes('n') ? 0 : 1 },
        { v: 'ish', w: cleaned.includes('s') ? 0 : 1 },
        { v: 'ite', w: cleaned.includes('t') ? 0 : 1 },
        { v: 'iard', w: cleaned.includes('d') || cleaned.includes('r') ? 0 : 1 },
        {
          v: 'ic',
          w: cleaned.includes('k') || cleaned.includes('c') || cleaned.includes('q') ? 0 : 1
        },
        { v: 'i', w: 1 },
        { v: 'ese', w: 1 }
      ])
      return TEXT.capitalize(cleaned + suffix)
    },
    firstName: (lang: Language, gender: Gender) => LANGUAGE.word.simple({ lang, key: gender }),
    simple: ({
        lang,
        key,
        repeat = false,
        len,
        ending = lang.ending,
        stopChance,
        variation = 10
      }: WordParams) => {
        // create a new cluster if one doesn't already exist
        if (!lang.clusters[key])
          lang.clusters[key] = CLUSTER.spawn({
            src: lang,
            key,
            len,
            ending,
            stopChance,
            variation
          })
        const morphemes = CLUSTER.morphemes(lang.clusters[key], lang, repeat)
        return { morphemes, word: TEXT.titleCase(morphemes.flat().join('')) }
      },
    unique: (params: WordParams): { morphemes: string[]; word: string } => {
      const { morphemes, word } = LANGUAGE.word.simple(params)
      if (_unique_names.has(word)) {
        return LANGUAGE.word.unique({ ...params, repeat: true })
      }
      _unique_names.add(word)
      return { morphemes, word }
    }
  },
  spawn: (seed: string) => {
    const lang = spawn(new Dice(seed))
    const dice = lang.dice
    // sonic character — rolled first so builders can use them
    lang.phonemeClass = dice.choice(['nasal', 'liquid', 'sibilant', 'guttural', 'plosive', 'airy'] as const)
    lang.syllableWeight = 'medium'
    // stop chance
    const stop = dice.weightedChoice([
      { v: ' ', w: 0.8 },
      { v: "'", w: 0.1 },
      { v: '-', w: 0.1 }
    ])
    lang.stop = stop
    const stopChance = stop === "'" ? dice.uniform(0.3, 0.6) : stop === '-' ? 1 : 0
    lang.stopChance = stopChance
    if (stop === "'" || stop === '-') {
      lang.articleChance = dice.uniform(0.1, 0.4)
    }
    // phonemes
    const vowels = buildBasicVowels({ ending: lang.ending, dice })
    const { consonantPhonemes, diacriticConsonants, orthoStyle } = buildConsonants({ ending: lang.ending, vowels, phonemeClass: lang.phonemeClass, dice })
    lang.orthoStyle = orthoStyle
    const { uniqueVowels, vowelPhonemes } = buildComplexVowels({
      vowels,
      consonants: consonantPhonemes[PhonemeCatalog.END_CONSONANT],
      stops: stopChance,
      ending: lang.ending,
      diacriticConsonants,
      dice
    })
    lang.vowels = uniqueVowels
    lang.diphthongs = lang.vowels.filter(v => !baseVowels.includes(v))
    lang.digraphs = Array.from(
      new Set(
        Object.entries(consonantPhonemes)
          .map(([, v]) => v)
          .flat()
          .filter(c => c.length > 1 && !['ng', 'str', 'th', 'sh', 'dr', 'br'].includes(c))
      )
    )
    lang.basePhonemes = { ...consonantPhonemes, ...vowelPhonemes }
    randomizePhonemes(lang)
    // word clusters: each cluster has similar words
    const shortSurnames = dice.random > 0.9
    initClusters({
      shortSurnames,
      shortFirst: lang.ending === PhonemeCatalog.MIDDLE_VOWEL && dice.random > 0.9,
      src: lang
    })
    const cluster = CLUSTER.spawn({ src: lang, key: 'generic', len: 1 })
    // patronymic surnames
    lang.surnames.patronymic = stop === ' ' && !shortSurnames && dice.random > 0.8
    if (lang.surnames.patronymic) {
      const vowels = dice.weightedSample(lang.phonemes[PhonemeCatalog.MIDDLE_VOWEL], 2)
      const start = dice.weightedChoice(lang.phonemes[PhonemeCatalog.START_CONSONANT])
      const end = dice.weightedChoice(lang.phonemes[PhonemeCatalog.END_CONSONANT])
      const endVowel = dice.weightedChoice(
        CLUSTER.endVowels(lang.clusters.female, end).filter(v => v.v.length < 2)
      )
      const pattern = vowels.map(v => `${start}${v}${end}`)
      lang.surnames.suffix = {
        male: pattern.map(p => `${p}`),
        female: pattern.map(p => `${p}${endVowel}`)
      }
    }
    if (!lang.surnames.patronymic && !shortSurnames && stop === ' ' && dice.random > 0.8) {
      if (dice.random > 0.2) {
        const vowels = dice.weightedSample(lang.phonemes[PhonemeCatalog.MIDDLE_VOWEL], 2)
        const end = dice.weightedChoice(lang.phonemes[PhonemeCatalog.END_CONSONANT])
        lang.surnames.epithets = vowels.map(v => `${v}${end}-`)
      } else {
        const prospects = lang.phonemes[PhonemeCatalog.START_CONSONANT].filter(
          l => l.v.length === 1
        )
        lang.surnames.epithets = dice
          .weightedSample(prospects, 3)
          .map(c => `${c.toLocaleUpperCase()}'`)
      }
    }
    // create title & article words
    lang.predefined = {
      the: [
        CLUSTER.simple(
          cluster,
          lang,
          dice.weightedChoice([
            { v: `${PhonemeCatalog.START_VOWEL}${PhonemeCatalog.END_CONSONANT}`, w: 0.2 },
            {
              v: `${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
              w: 0.8
            }
          ])
        )
      ],
      title: [
        CLUSTER.simple(
          cluster,
          lang,
          dice.weightedChoice([
            { v: `${PhonemeCatalog.START_VOWEL}${PhonemeCatalog.END_CONSONANT}`, w: 0.2 },
            {
              v: `${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
              w: 0.8
            }
          ])
        )
      ]
    }
    return lang
  },
  dialect: (base: Language) => {
    const lang = spawn(new Dice(base.dice.randint(0, 2147483647).toString()))
    lang.ending = base.ending
    lang.phonemeClass = base.phonemeClass
    lang.syllableWeight = base.syllableWeight
    lang.stop = base.stop
    lang.stopChance = base.stopChance
    lang.articleChance = base.articleChance
    lang.surnames = { ...base.surnames }
    lang.basePhonemes = { ...base.basePhonemes }
    lang.vowels = [...base.vowels]
    lang.diphthongs = [...base.diphthongs]
    lang.digraphs = [...base.digraphs]
    randomizePhonemes(lang)
    initClusters({ src: lang })
    Object.keys(lang.clusters).forEach(k => {
      lang.clusters[k].patterns = base.clusters[k].patterns
      lang.clusters[k].stopChance = base.clusters[k].stopChance
      lang.clusters[k].ending = base.clusters[k].ending
      lang.clusters[k].len = base.clusters[k].len
    })
    lang.predefined = { ...base.predefined }
    return lang
  },
  classify: (lang: Language): { extType: string | null; orthoStyle: OrthoStyle | null; hasGemination: boolean } => {
    const baseSet = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'w'])
    const isBase = (c: string) => baseSet.has(c)
    const catVowel = (v: string): string => {
      const chars = [...v]
      if (chars.length === 1) return isBase(chars[0]) ? 'diphthongs' : 'diacritics'
      const allBase = chars.every(c => isBase(c))
      if (allBase) return chars[0] === chars[1] ? 'doubles' : 'diphthongs'
      return 'mixed'
    }
    let extType: string | null = null
    if (lang.diphthongs.length > 0) {
      const cats = new Set(lang.diphthongs.map(catVowel))
      extType = cats.size === 1 ? [...cats][0] : 'mixed'
    }
    const hasGemination = lang.phonemes[PhonemeCatalog.MIDDLE_CONSONANT].some(
      ({ v }) => v.length >= 2 && v[0] === v[1]
    )
    return { extType, orthoStyle: lang.orthoStyle !== 'standard' ? lang.orthoStyle : null, hasGemination }
  },
  vowel: (vowel: string) => {
    return vowel.includes(PhonemeCatalog.FRONT_VOWEL)
  }
}
