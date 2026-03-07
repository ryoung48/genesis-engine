import { range } from 'd3'
import { TEXT } from '../../../utilities/text'
import { Cluster, Language, PhonemeCatalog, STOP_CHAR, vowelRules } from './types'

const aVowels = ['a', 'ä', 'å', 'á', 'â', 'ā']
const eVowels = ['e', 'ë', 'é', 'ê', 'ē']
const yiVowels = ['i', 'y', 'ï', 'ÿ', 'í', 'ý', 'î', 'ī']
const iVowels = ['i', 'ï', 'í', 'î', 'ī']
const oVowels = ['o', 'u', 'ø', 'ö', 'ü', 'ó', 'ú', 'ô', 'û', 'ō', 'ū']
const feminineConsonants = ['l', 'll', 'n', 'nn', 's', 'ss', 'th', 'x', 'xx']
const singleUseLetters = ['b', 'f', 'j', 'p', 'w', 'v', 'x']

const wordLength = (cluster: Cluster, src: Language) => {
  const mod = src.dice.random < cluster.longNames ? 1 : 0
  return cluster.len + mod
}

const basePatternize = (cluster: Cluster, src: Language) => {
  // pick a pattern from the selected group
  const next: Record<string, string> = {
    [PhonemeCatalog.MIDDLE_CONSONANT]: PhonemeCatalog.MIDDLE_VOWEL,
    [PhonemeCatalog.MIDDLE_VOWEL]: PhonemeCatalog.MIDDLE_CONSONANT,
    [STOP_CHAR]: STOP_CHAR
  }
  const len = wordLength(cluster, src)
  let prev: string =
    src.dice.random > 0.3 ? PhonemeCatalog.MIDDLE_VOWEL : PhonemeCatalog.MIDDLE_CONSONANT
  let stopped = false
  const pattern = range(len).map((_, i) => {
    prev = cluster.patterns[next[prev.slice(-1)]]
    if (!stopped && i !== len - 1 && src.dice.random < cluster.stopChance) {
      prev = `${prev}${STOP_CHAR}`
      stopped = true
    }
    return prev
  })
  pattern.forEach((seg, i) => {
    if (seg.includes(STOP_CHAR)) {
      pattern[i] = pattern[i].replace(
        `${PhonemeCatalog.MIDDLE_CONSONANT}${STOP_CHAR}`,
        `${PhonemeCatalog.END_CONSONANT}${STOP_CHAR}`
      )
      // eslint-disable-next-line no-useless-escape
      const startC = new RegExp(`^${PhonemeCatalog.MIDDLE_CONSONANT}(\W*)`)
      pattern[i + 1] = pattern[i + 1].replace(startC, `${PhonemeCatalog.START_CONSONANT}$1`)
    }
  })
  const e = pattern.length - 1
  let ending = pattern[e].slice(-1)
  // append proper ending char
  if (cluster.ending && cluster.ending !== ending) {
    pattern[e] += cluster.ending
  }
  // replace with proper start|end consonant
  ending = pattern[e].slice(-1)
  if (ending === PhonemeCatalog.MIDDLE_CONSONANT) {
    pattern[e] = `${pattern[e].slice(0, -1)}${PhonemeCatalog.END_CONSONANT}`
  }
  if (ending === PhonemeCatalog.MIDDLE_VOWEL) {
    pattern[e] = `${pattern[e].slice(0, -1)}${PhonemeCatalog.END_VOWEL}`
  }
  let start = pattern[0][0]
  if (start === PhonemeCatalog.MIDDLE_VOWEL) {
    pattern[0] = `${PhonemeCatalog.START_VOWEL}${pattern[0].slice(1)}`
  }
  start = pattern[0][0]
  if (start === PhonemeCatalog.MIDDLE_CONSONANT) {
    pattern[0] = `${PhonemeCatalog.START_CONSONANT}${pattern[0].slice(1)}`
  }
  // sub in middle vowels
  const bv = new RegExp(`${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`, 'g')
  pattern[0] = pattern[0].replace(
    bv,
    `${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.FRONT_VOWEL}`
  )
  const vf = new RegExp(`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`, 'g')
  pattern[e] = pattern[e].replace(vf, `${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`)
  return pattern
}
const femininePattern = (cluster: Cluster, src: Language) => {
  const pattern = basePatternize(cluster, src)
  const hasContent =
    cluster.phonemes[PhonemeCatalog.END_CONSONANT].length > 0 &&
    cluster.phonemes[PhonemeCatalog.BACK_VOWEL].length > 0
  if (
    hasContent &&
    src.ending === PhonemeCatalog.MIDDLE_CONSONANT &&
    src.dice.random < src.consonantChance
  ) {
    const e = pattern.length - 1
    const cl = new RegExp(`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.END_VOWEL}`, 'g')
    pattern[e] = pattern[e].replace(
      cl,
      `${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`
    )
  }
  return pattern
}

const patternize = (cluster: Cluster, src: Language) => {
    if (cluster.key === 'female') return femininePattern(cluster, src)
    return basePatternize(cluster, src)
  }

const notHarsh = (
  src: Language,
  params: {
    curr: string
    prev: string
    usedLongVowel: boolean
    usedDigraph: boolean
  }
) => {
  const { curr, prev, usedLongVowel, usedDigraph } = params
  const longVowel = usedLongVowel && hasLongVowel(src, curr)
  const digraph = usedDigraph && hasDigraph(src, curr)
  const nonVowels = prev.split('').filter(c => !src.vowels.includes(c))
  const lowercaseWord = `${prev}${curr}`.toLowerCase()
  const repeatedRestricted = singleUseLetters.some(letter => {
    const positions = [...lowercaseWord].flatMap((c, i) => (c === letter ? [i] : []))
    if (positions.length <= 1) {
      return false
    }
    const first = positions[0]
    const last = positions[positions.length - 1]
    // Allow contiguous runs (gemination) like "bb", but reject split repeats like "b...b".
    return last - first + 1 !== positions.length
  })
  return (
    !longVowel &&
    !digraph &&
    !repeatedRestricted &&
    !curr
      .split('')
      .filter(mc => !src.vowels.includes(mc))
      .some(mc => nonVowels.slice(-1).includes(mc))
  )
}
const validLetter = (
  src: Language,
  params: {
    curr: string
    prev: string
    type: string
    usedLongVowel: boolean
    usedDigraph: boolean
  }
) => {
  const { curr, prev, type, usedLongVowel, usedDigraph } = params
  const validFront =
    type !== PhonemeCatalog.FRONT_VOWEL ||
    !vowelRules.front[curr] ||
    vowelRules.front[curr].includes(prev.substr(-1)) ||
    vowelRules.front[curr].includes(prev.substr(-2))
  const validEnd =
    type !== PhonemeCatalog.END_CONSONANT ||
    !vowelRules.back[prev.slice(-2)] ||
    vowelRules.back[prev.slice(-2)].includes(curr)
  return notHarsh(src, { curr, prev, usedLongVowel, usedDigraph }) && validEnd && validFront
}

const hasLongVowel = (src: Language, prospect: string) =>
  src.diphthongs.some(v => prospect.includes(v))

const hasDigraph = (src: Language, prospect: string) => src.digraphs.some(v => prospect.includes(v))

const baseEndVowels = (cluster: Cluster) => cluster.phonemes[PhonemeCatalog.END_VOWEL]
const feminineEndVowels = (cluster: Cluster, prev: string) => {
  const vowels = [...aVowels, ...iVowels]
  if (['l', 'n'].includes(prev.slice(-1)) || ['ett'].includes(prev.slice(-3))) {
    vowels.push(...eVowels)
  }
  const complex: string[] = []
  if (['r', 'f'].includes(prev.slice(-1))) {
    complex.push('ie', 'ae')
  }
  if (['m', 'r', 's', 'z'].includes(prev.slice(-1)) || ['th', 'sh', 'h'].includes(prev.slice(-2))) {
    complex.push(...['ee', 'ée', 'ëe', 'êe', 'ae'])
  }
  return baseEndVowels(cluster).filter(
    v => vowels.includes(v.v.slice(-1)) || complex.includes(v.v.slice(-2))
  )
}
const masculineEndVowels = (cluster: Cluster) => {
  return baseEndVowels(cluster).filter(v => oVowels.includes(v.v.slice(-1)))
}
const endVowels = (cluster: Cluster, prev: string) => {
  if (cluster.key === 'female') return feminineEndVowels(cluster, prev)
  if (cluster.key === 'male') return masculineEndVowels(cluster)
  return baseEndVowels(cluster)
}

const baseEndConsonants = (cluster: Cluster) => cluster.phonemes[PhonemeCatalog.END_CONSONANT]
const masculineEndConsonants = (cluster: Cluster, prev: string) => {
  const prevSub1 = prev.slice(-1)
  const prevSub2 = prev.slice(-2)
  const endings = cluster.phonemes[PhonemeCatalog.END_CONSONANT]
  const valid = endings.filter(i => !feminineConsonants.includes(i.v))
  if (valid.length > 0 && yiVowels.includes(prevSub1) && !vowelRules.back[prevSub2]) {
    return endings.filter(i => !feminineConsonants.includes(i.v))
  }
  return endings
}
const endConsonants = (cluster: Cluster, prev: string) => {
  if (cluster.key === 'male') return masculineEndConsonants(cluster, prev)
  return baseEndConsonants(cluster)
}

const baseBackVowels = (cluster: Cluster) => cluster.phonemes[PhonemeCatalog.BACK_VOWEL]
const masculineBackVowels = (cluster: Cluster) => {
  const endings = cluster.phonemes[PhonemeCatalog.END_CONSONANT]
  const valid = endings.filter(i => !feminineConsonants.includes(i.v))
  const back = cluster.phonemes[PhonemeCatalog.BACK_VOWEL]
  return valid.length > 0 ? back.filter(v => !yiVowels.includes(v.v)) : back
}
const backVowels = (cluster: Cluster) => {
  if (cluster.key === 'male') return masculineBackVowels(cluster)
  return baseBackVowels(cluster)
}

const syllable = (
  cluster: Cluster,
  src: Language,
  params: {
    template: string
    currWord: string[]
    usedLongVowel: boolean
    usedDigraph: boolean
  }
) => {
  const { template, currWord, usedLongVowel, usedDigraph } = params
  // create a new syllable from template
  let prev = currWord.join('')
  let localLongVowel = usedLongVowel
  let localUsedDigraph = usedDigraph
  return template
    .split('')
    .map(c => {
      const letter = c as PhonemeCatalog | typeof STOP_CHAR
      // no action for stop characters (they can only appear once)
      if (letter === STOP_CHAR) {
        return src.stop
      }
      const phonemes =
        letter === PhonemeCatalog.END_VOWEL
          ? endVowels(cluster, prev)
          : letter === PhonemeCatalog.END_CONSONANT
          ? endConsonants(cluster, prev)
          : letter === PhonemeCatalog.BACK_VOWEL
          ? backVowels(cluster)
          : cluster.phonemes[letter]
      // get the valid character set (non-unique or non-used characters)
      const valid = phonemes.filter(m =>
        validLetter(src, {
          curr: m.v,
          prev,
          type: letter,
          usedLongVowel: localLongVowel,
          usedDigraph: localUsedDigraph
        })
      )
      // pick a random character from the valid set
      // use all characters if there are none left
      const chosen = src.dice.weightedChoice(valid.length > 0 ? valid : cluster.phonemes[letter])
      prev += chosen
      // prevent additional long vowels
      if (hasLongVowel(src, chosen)) {
        localLongVowel = true
      }
      if (hasDigraph(src, chosen)) {
        localUsedDigraph = true
      }
      return chosen
    })
    .join('')
}

const hasMorph = (cluster: Cluster, template: string, morph: string) =>
  cluster.morphemes[template].filter(m => m !== cluster.newSyl).some(m => m === morph)

const newMorph = (
  cluster: Cluster,
  src: Language,
  params: {
    template: string
    currWord: string[]
    usedLongVowel: boolean
    usedDigraph: boolean
  }
) => {
  const { template, currWord, usedLongVowel, usedDigraph } = params
  // create new syllable
  const prospect = syllable(cluster, src, { template, currWord, usedLongVowel, usedDigraph })
  // add syllable to morpheme pattern list
  if (!hasMorph(cluster, template, prospect)) {
    cluster.morphemes[template].push(prospect)
  }
  return prospect
}

const morpheme = (
    cluster: Cluster,
    src: Language,
    params: {
      template: string
      word: string[]
      usedLongVowel: boolean
      usedDigraph: boolean
      repeat?: boolean
    }
  ) => {
    const { word, repeat, template } = params
    let { usedLongVowel, usedDigraph } = params
    // create morpheme distribution for pattern template if one doesn't already exist
    if (!cluster.morphemes[template]) {
      // each '*' is a chance to create a new morpheme
      // greater chance to create new morphemes for start sequences
      cluster.morphemes[template] = []
      const start: string[] = [PhonemeCatalog.START_CONSONANT, PhonemeCatalog.START_VOWEL]
      if (start.includes(template[0])) {
        cluster.morphemes[template] = range(cluster.variation).map(() => cluster.newSyl)
      } else {
        range(cluster.variation).map(() =>
          newMorph(cluster, src, { template, currWord: word, usedLongVowel, usedDigraph })
        )
        const { phonemes } = src
        // add non-standard ('ah') endings if applicable
        const hasH = phonemes[PhonemeCatalog.START_CONSONANT]
          .concat(phonemes[PhonemeCatalog.MIDDLE_CONSONANT])
          .some(({ v }) => v === 'h')
        if (cluster.key === 'female' && template.includes(PhonemeCatalog.END_CONSONANT) && hasH) {
          const partial = template.replace(
            `${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
            ''
          )
          const prefix = CLUSTER.simple(cluster, src, partial).toLowerCase()
          aVowels
            .filter(a => phonemes[PhonemeCatalog.BACK_VOWEL].some(({ v }) => v === a))
            .forEach(a => cluster.morphemes[template].push(`${prefix}${a}h`))
        }
      }
    }
    // valid morphemes haven't been already used and don't include used unique characters
    const prev = word.join('')
    const valid = cluster.morphemes[template].filter(curr => {
      return (
        curr === cluster.newSyl ||
        (!word.includes(curr) && notHarsh(src, { curr, prev, usedLongVowel, usedDigraph }))
      )
    })
    const idx = ~~(src.dice.random * valid.length)
    let prospect = !valid[idx] || repeat ? cluster.newSyl : valid[idx]
    // create a new morpheme if none valid or '*' is chosen
    if (prospect === cluster.newSyl) {
      // add new morpheme
      prospect = newMorph(cluster, src, { template, currWord: word, usedLongVowel, usedDigraph })
    }
    // prevent additional long vowels
    if (hasLongVowel(src, prospect)) {
      usedLongVowel = true
    }
    if (hasDigraph(src, prospect)) {
      usedDigraph = true
    }
    // add morpheme to used morpheme list
    word.push(prospect)
    return { usedLongVowel, usedDigraph }
  }

export const CLUSTER = {
  endVowels,
  simple: (cluster: Cluster, src: Language, template: string) =>
    TEXT.titleCase(
      syllable(cluster, src, { template, currWord: [], usedLongVowel: true, usedDigraph: true })
    ),
  spawn: (args: Partial<Cluster> & { src: Language }) => {
    const structures = {
      [PhonemeCatalog.MIDDLE_VOWEL]: [
        `${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
        `${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`
      ],
      [PhonemeCatalog.MIDDLE_CONSONANT]: [
        `${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`,
        `${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`
      ]
    }
    const { src } = args
    src.dice.random > 0.5
      ? structures[PhonemeCatalog.MIDDLE_VOWEL].pop()
      : structures[PhonemeCatalog.MIDDLE_CONSONANT].pop()
    const vowelStruct = src.dice.choice(structures.V)
    const conStruct = src.dice.choice(structures.C)
    const cluster: Cluster = {
      phonemes: src.phonemes,
      morphemes: {},
      newSyl: '*',
      key: args.key || '',
      ending: args.ending,
      stopChance: args.stopChance || 0,
      len: args.len || 2,
      variation: args.variation || 3,
      longNames: args.longNames || 0,
      patterns: {
        [PhonemeCatalog.MIDDLE_VOWEL]: vowelStruct,
        [PhonemeCatalog.MIDDLE_CONSONANT]: conStruct,
        [STOP_CHAR]:
          src.stop === '-'
            ? `${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`
            : src.dice.choice([conStruct, vowelStruct])
      }
    }
    if (args.key === 'female') {
      const { phonemes } = args.src
      cluster.phonemes = JSON.parse(JSON.stringify(phonemes))
      cluster.phonemes[PhonemeCatalog.BACK_VOWEL].forEach(k => {
        if (!yiVowels.includes(k.v)) {
          cluster.phonemes[PhonemeCatalog.BACK_VOWEL] = cluster.phonemes[
            PhonemeCatalog.BACK_VOWEL
          ].filter(({ v }) => v !== k.v)
        }
      })
      cluster.phonemes[PhonemeCatalog.END_CONSONANT].forEach(k => {
        if (!feminineConsonants.includes(k.v)) {
          cluster.phonemes[PhonemeCatalog.END_CONSONANT] = cluster.phonemes[
            PhonemeCatalog.END_CONSONANT
          ].filter(({ v }) => v !== k.v)
        }
      })
    }
    return cluster
  },
  morphemes: (cluster: Cluster, src: Language, repeat = false) => {
    // pick a pattern from the selected group
    const pattern = patternize(cluster, src)
    // create the word from cluster defined morphemes (reverse order favors double vowels at the end)
    let usedLongVowel = false
    let usedDigraph = false
    const morphemes: string[] = []
    pattern.forEach(template => {
      const updates = morpheme(cluster, src, {
        template,
        repeat,
        word: morphemes,
        usedLongVowel,
        usedDigraph
      })
      usedLongVowel = updates.usedLongVowel
      usedDigraph = updates.usedDigraph
    })
    return morphemes
  },
  word: (cluster: Cluster, src: Language, repeat = false) => {
    // pick a pattern from the selected group
    const pattern = patternize(cluster, src)
    // create the word from cluster defined morphemes (reverse order favors double vowels at the end)
    let usedLongVowel = false
    let usedDigraph = false
    const word: string[] = []
    pattern.forEach(template => {
      const updates = morpheme(cluster, src, {
        template,
        repeat,
        word,
        usedLongVowel,
        usedDigraph
      })
      usedLongVowel = updates.usedLongVowel
      usedDigraph = updates.usedDigraph
    })
    // finalize word
    return TEXT.titleCase(CLUSTER.morphemes(cluster, src, repeat).flat().join(''))
  },
  vowel: (vowel: string) => {
    return [...aVowels, ...eVowels, ...iVowels, ...oVowels, ...yiVowels].includes(vowel)
  }
}

