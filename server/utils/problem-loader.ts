// server/utils/problem-loader.ts
import fs from 'fs'
import path from 'path'
import { getNextTurn } from '../../lib/sgf-utils'

interface ProblemData {
  id: number
  turn: string
  description: string
  sgfContent: string
  moves?: number
  deadline?: Date
}

export function loadProblemFromDirectory(problemId: string): ProblemData | null {
  const rootDir =
    process.env.NODE_ENV === 'production'
      ? path.join(__dirname, '../../..') // dist/server/utils から ルートへ
      : path.join(__dirname, '../..') // server/utils から ルートへ
  const problemDir = path.join(rootDir, 'public/problems', problemId)

  try {
    // description.txt の読み込み
    const descriptionPath = path.join(problemDir, 'description.txt')
    const descriptionContent = fs.readFileSync(descriptionPath, 'utf-8')

    // SGFファイルの読み込み
    const sgfPath = path.join(problemDir, 'kifu.sgf')
    const sgfContent = fs.readFileSync(sgfPath, 'utf-8')

    // description.txt のパース
    const parsedProblemData = parseDescriptionFile(descriptionContent)

    // 手番を推定
    // description.txt に手番の記載があればそれを優先する。
    // 記載がなければ moves の偶奇で手番を推定し、
    // moves もない場合は最終手をsgfファイルから推定する。
    let turn = parsedProblemData.turn
    if (!turn) {
      if (parsedProblemData.moves !== undefined) {
        turn = parsedProblemData.moves % 2 === 1 ? 'white' : 'black'
      } else {
        turn = getNextTurn(sgfContent)
      }
    }

    return {
      id: parseInt(problemId),
      turn,
      description: parsedProblemData.description,
      moves: parsedProblemData.moves,
      deadline: parsedProblemData.deadline,
      sgfContent,
    }
  } catch (error) {
    console.error(`Failed to load problem ${problemId}:`, error)
    return null
  }
}

interface ParsedProblemData {
  turn?: string
  description: string
  moves?: number
  deadline?: Date
}

function parseDescriptionFile(content: string): ParsedProblemData {
  const lines = content.trim().split('\n')
  const data: any = {}

  lines.forEach((line) => {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      data[key.trim()] = valueParts.join(':').trim()
    }
  })

  // 必須項目のチェック（新フォーマット）
  if (!data.description) {
    throw new Error('必須項目が不足しています: description')
  }

  return {
    turn: data.turn,
    description: data.description,
    moves: data.moves ? parseInt(data.moves) : undefined,
    deadline: data.deadline ? new Date(data.deadline) : undefined,
  }
}
