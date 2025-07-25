// client/src/components/GoBoard.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import '../styles/GoBoard.css'
import { parseSgfMoves } from '../../../lib/sgf-utils'

interface GoBoardProps {
  sgfContent: string
  onCoordinateSelect?: (coordinate: string) => void
  showClickable?: boolean
  resultsData?: Record<string, { votes: number; answers: any[] }>
  maxMoves?: number // movesパラメータ対応
  derivedTurn: "black" | "white"
}

declare global {
  interface Window {
    WGo: any
  }
}

export default function GoBoard({
  sgfContent,
  onCoordinateSelect,
  showClickable = false,
  resultsData,
  maxMoves,
  derivedTurn,
}: GoBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [board, setBoard] = useState<any>(null)
  const [isWgoLoaded, setIsWgoLoaded] = useState(false)
  const clickedMarkRef = useRef<any>(null)

  // WGo.jsの読み込み確認（公式推奨方式）
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 50 // 5秒間待つ

    const checkWgoLoaded = () => {
      if (typeof window !== 'undefined' && window.WGo) {
        setIsWgoLoaded(true)
      } else {
        retryCount++

        if (retryCount < maxRetries) {
          setTimeout(checkWgoLoaded, 100)
        } else {
          console.error('Failed to load WGo.js after', maxRetries, 'attempts')
        }
      }
    }
    checkWgoLoaded()
  }, [])

  // 結果表示用のクリックハンドラーを保存
  const resultClickHandlerRef = useRef<any>(null)

  // 結果表示を更新する関数
  const updateResultsDisplay = useRef<(results: any) => void>()

  // 碁盤の初期化（resultsDataを依存配列から除外）
  useEffect(() => {
    if (!isWgoLoaded || !boardRef.current) return

    const initializeBoard = () => {
      try {
        // 既存の碁盤を削除
        if (boardRef.current) {
          boardRef.current.innerHTML = ''
        }

        // コンテナのサイズを取得
        const containerRect = boardRef.current.getBoundingClientRect()
        const containerWidth = Math.min(containerRect.width || 360, 500)

        const newBoard = new window.WGo.Board(boardRef.current, {
          size: 19,
          width: containerWidth,
          height: containerWidth,
          font: 'Calibri',
          lineWidth: 1,
          background: '/wgo/wood1.jpg',
          section: { top: -0.5, bottom: -0.5, left: -0.5, right: -0.5 }, // 座標表示のため余白拡大
        })

        // 座標表示用のカスタム描画ハンドラーを定義
        const coordinates = {
          grid: {
            draw: function (args: any, board: any) {
              const ctx = this
              // テキスト描画のスタイル設定
              ctx.fillStyle = 'rgba(0,0,0,0.7)'
              ctx.textBaseline = 'middle'
              ctx.textAlign = 'center'
              ctx.font = board.stoneRadius + 'px ' + (board.font || '')

              // 盤外に文字を配置するための座標計算
              const xLeft = board.getX(board.size - 0.25) // 右端より少し右のX座標
              const xRight = board.getX(-0.75) // 左端より少し左のX座標
              const yTop = board.getY(-0.75) // 上端より少し上のY座標
              const yBottom = board.getY(board.size - 0.25) // 下端より少し下のY座標

              // 全ての交点に対応する座標ラベルを描画
              for (let i = 0; i < board.size; i++) {
                // 横方向の文字(A～T)を決定（'I'を飛ばす）
                let charCode = 'A'.charCodeAt(0) + i
                if (charCode >= 'I'.charCodeAt(0)) charCode++ // 'I'の文字コードをスキップ
                const letter = String.fromCharCode(charCode)

                // 縦座標（数字）ラベルを左端と右端に描画
                const y = board.getY(i)
                ctx.fillText(board.size - i, xLeft, y) // 左側：19,18,...1
                ctx.fillText(board.size - i, xRight, y) // 右側：19,18,...1

                // 横座標（英字）ラベルを上端と下端に描画
                const x = board.getX(i)
                ctx.fillText(letter, x, yTop) // 上側：A,...T（I抜き）
                ctx.fillText(letter, x, yBottom) // 下側：A,...T（I抜き）
              }
            },
          },
        }

        // 座標表示ハンドラーを追加
        newBoard.addCustomObject(coordinates)

        setBoard(newBoard)

        if (sgfContent) {
          // SGF処理（WGo.Gameクラス使用）
          const game = new window.WGo.Game()
          const lastMove = loadSgfToGame(game, sgfContent, maxMoves)

          // 現在のポジションを盤面に反映
          const position = game.getPosition()
          updateBoardPosition(newBoard, position, lastMove || undefined)

          // アンケート回答ページでのクリック処理（公式addEventListener）
          if (showClickable && onCoordinateSelect) {
            // クリックマーカー保存用変数
            let lastClickMarker: any = null

            // 現在の手番を取得（黒番: 1, 白番: -1）
            const currentTurn = derivedTurn === "black" ? window.WGo.B : window.WGo.W
	    
            // カスタム着手点マーカーハンドラーを定義
            const clickMarkerHandler = {
              stone: {
                draw: function (args: any, board: any) {
                  const ctx = board.stone.getContext(args.x, args.y)
                  const xr = board.getX(args.x)
                  const yr = board.getY(args.y)
                  const sr = board.stoneRadius

                  // 手番に応じた色を設定
                  const markerColor = currentTurn === 1 ? '#000000' : '#FFFFFF' // 黒番なら黒、白番なら白
                  const markerAlpha =
                    currentTurn === 1 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)'

                  // 外側の円を描画
                  ctx.beginPath()
                  ctx.arc(xr, yr, sr * 0.9, 0, 2 * Math.PI, true)
                  ctx.lineWidth = 3
                  ctx.strokeStyle = markerColor
                  ctx.stroke()

                  // 内側の塗りつぶし円（半透明）
                  ctx.beginPath()
                  ctx.arc(xr, yr, sr * 1.0, 0, 2 * Math.PI, true)
                  ctx.fillStyle = markerAlpha
                  ctx.fill()

                  // 白番の場合は黒い輪郭を追加
                  if (currentTurn === -1) {
                    ctx.beginPath()
                    ctx.arc(xr, yr, sr * 1.0, 0, 2 * Math.PI, true)
                    ctx.lineWidth = 2
                    ctx.strokeStyle = '#000000'
                    ctx.stroke()
                  }

                  // 中心の点
                  ctx.beginPath()
                  ctx.arc(xr, yr, sr * 0.2, 0, 2 * Math.PI, true)
                  ctx.fillStyle = markerColor
                  ctx.fill()
                },
              },
            }

            newBoard.addEventListener('click', (x: number, y: number) => {
              // 着手禁止点、盤外の点などは無視
              if (!game.isValid(x, y, currentTurn)) return

              // 公式座標システム（相対座標）
              const coordinate = wgoToSgfCoords(x, y)
              onCoordinateSelect(coordinate)

              // 視覚的フィードバック
              // すべてのオブジェクトを削除してから石を再配置
              newBoard.removeAllObjects()

              // 既存の石を再配置（最終手マークも含む）
              const position = game.getPosition()
              updateBoardPosition(newBoard, position, lastMove || undefined)

              // 新しいマーカーを追加（カスタムハンドラー使用）
              lastClickMarker = {
                x: x,
                y: y,
                type: clickMarkerHandler,
              }
              newBoard.addObject(lastClickMarker)
            })
          }

          // 結果表示を更新する関数を保存
          updateResultsDisplay.current = (results: any) => {
            displayResults(newBoard, results)
          }

          // 初回のみ結果を表示
          if (resultsData && Object.keys(resultsData).length > 0) {
            displayResults(newBoard, resultsData)
          }
        }
      } catch (error) {
        console.error('Failed to initialize WGo.Board:', error)
        // エラー詳細を表示
        if (error instanceof Error) {
          console.error('Error message:', error.message)
          console.error('Error stack:', error.stack)
        }
      }
    }

    // コンテナのサイズが確定してから初期化
    const timer = setTimeout(() => {
      initializeBoard()
    }, 100)

    // クリーンアップ
    return () => {
      clearTimeout(timer)
      if (board) {
        board.removeAllObjects?.()
        // 以前のクリックハンドラーを削除
        if (resultClickHandlerRef.current) {
          board.removeEventListener('click', resultClickHandlerRef.current)
          resultClickHandlerRef.current = null
        }
      }
    }
  }, [isWgoLoaded, sgfContent, showClickable, maxMoves]) // resultsDataを除外

  // resultsDataが変更されたときだけ結果表示を更新
  useEffect(() => {
    if (updateResultsDisplay.current) {
      updateResultsDisplay.current(resultsData)
    }
  }, [resultsData])

  // SGFをWGo.Gameに読み込み（公式Game API使用）
  const loadSgfToGame = (
    game: any,
    sgfContent: string,
    maxMoves?: number,
  ): { x: number; y: number; color: number } | null => {
    try {
      // 簡易SGFパーサー（公式の詳細パーサーがあれば使用推奨）
      const moves = parseSgfMoves(sgfContent)
      let lastMove: { x: number; y: number; color: number } | null = null

      moves.forEach((move, index) => {
        if (maxMoves !== undefined && index >= maxMoves) return

        if (move.color && move.x !== undefined && move.y !== undefined) {
          // sgf-utilsから返されるcolor値（1 or -1）をWGo.jsの値に変換
          const wgoColor = move.color === 1 ? window.WGo.B : window.WGo.W
          // 公式play()メソッド使用
          const result = game.play(move.x, move.y, wgoColor)

          // maxMovesで制限される最後の手を記録
          if (maxMoves === undefined || index === maxMoves - 1) {
            lastMove = { x: move.x, y: move.y, color: wgoColor }
          }
        }
      })

      return lastMove
    } catch (error) {
      console.error('Failed to load SGF:', error)
      return null
    }
  }

  // ポジションを盤面に反映（公式Position API使用）
  const updateBoardPosition = (
    boardInstance: any,
    position: any,
    lastMove?: { x: number; y: number; color: number },
  ) => {
    boardInstance.removeAllObjects() // 既存オブジェクト削除

    for (let x = 0; x < position.size; x++) {
      for (let y = 0; y < position.size; y++) {
        const stone = position.get(x, y)
        if (stone !== 0) {
          // 公式addObject（石の配置）
          boardInstance.addObject({
            x: x,
            y: y,
            c: stone, // WGo.B または WGo.W （石の場合はtypeは不要）
          })
        }
      }
    }

    // 最終手にマークを表示
    if (lastMove && lastMove.x >= 0 && lastMove.y >= 0) {
      // カスタムマーカーハンドラーを定義
      const lastMoveMarkerHandler = {
        stone: {
          draw: function (args: any, board: any) {
            const ctx = board.stone.getContext(args.x, args.y)
            const xr = board.getX(args.x)
            const yr = board.getY(args.y)
            const sr = board.stoneRadius

            // 石の色に応じて円の色を決定（白石には黒丸、黒石には白丸）
            const markerColor = lastMove.color === window.WGo.B ? '#FFFFFF' : '#000000'

            // 円を描画
            ctx.beginPath()
            ctx.arc(xr, yr, sr * 0.5, 0, 2 * Math.PI, true)
            ctx.lineWidth = 3
            ctx.strokeStyle = markerColor
            ctx.stroke()
          },
        },
      }

      boardInstance.addObject({
        x: lastMove.x,
        y: lastMove.y,
        type: lastMoveMarkerHandler,
      })
    }
  }

  // 結果表示用オブジェクトとポジションを保存
  const resultObjectsRef = useRef<any[]>([])
  const boardPositionRef = useRef<any>(null)

  // 結果表示機能（WGo.jsのaddObjectを使用）
  const displayResults = (
    boardInstance: any,
    results: Record<string, { votes: number; answers: any[] }> | undefined,
  ) => {
    // 前回の結果表示オブジェクトを削除
    // removeObjectが正しく動作しない場合があるため、
    // すべてのオブジェクトを削除してから再配置する
    boardInstance.removeAllObjects()
    resultObjectsRef.current = []

    // 初回のみポジションを保存
    if (!boardPositionRef.current) {
      const game = new window.WGo.Game()
      const lastMove = loadSgfToGame(game, sgfContent, maxMoves)
      boardPositionRef.current = {
        position: game.getPosition(),
        lastMove: lastMove,
      }
    }
    const position = boardPositionRef.current.position
    const lastMove = boardPositionRef.current.lastMove

    // 既存の石を再配置
    updateBoardPosition(boardInstance, position, lastMove || undefined)

    if (results == null) {
      return
    }

    // 結果の数字を表示（docs/wgo.mdの推奨方法に従い、石とラベルを重ねて表示）
    Object.entries(results).forEach(([coordinate, data]) => {
      const coords = sgfToWgoCoords(coordinate)

      if (coords.x >= 0 && coords.x < 19 && coords.y >= 0 && coords.y < 19) {
        const stoneAtPosition = position.get(coords.x, coords.y)

        // 石がない場合は、色付き円を追加
        if (stoneAtPosition === 0) {
          // カスタム描画ハンドラを定義
          const voteCircleHandler = {
            stone: {
              draw: function (args: any, board: any) {
                const ctx = board.stone.getContext(args.x, args.y)
                const xr = board.getX(args.x)
                const yr = board.getY(args.y)
                const sr = board.stoneRadius

                // 背景の円を描画
                ctx.beginPath()
                ctx.arc(xr, yr, sr * 1.0, 0, 2 * Math.PI, true)
                ctx.fillStyle = args.bgColor
                ctx.fill()

                // テキストを描画
                ctx.font = `bold ${sr * 1.0}px Calibri`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = '#FFFFFF'
                ctx.strokeStyle = args.bgColor
                ctx.lineWidth = 3
                ctx.strokeText(args.text, xr, yr)
                ctx.fillText(args.text, xr, yr)
              },
            },
          }

          const obj = {
            x: coords.x,
            y: coords.y,
            type: voteCircleHandler,
            text: data.votes.toString(),
            bgColor: getColorByVotes(data.votes),
          }
          boardInstance.addObject(obj)
          resultObjectsRef.current.push(obj)
        } else {
          // 石がある場合は、標準のラベルマーカーを使用
          const obj = {
            x: coords.x,
            y: coords.y,
            type: 'LB',
            text: data.votes.toString(),
          }
          boardInstance.addObject(obj)
          resultObjectsRef.current.push(obj)
        }
      }
    })

    // 着手選択マーク用のレイヤを作成して碁盤に追加
    const addClickedMarkLayer = (xr: number, yr: number) => {
      const layer = new WGo.Board.CanvasLayer()
      const sr = boardInstance.stoneRadius
      const ctx = layer.context

      if (clickedMarkRef.current && clickedMarkRef.current.layer) {
        boardInstance.removeLayer(clickedMarkRef.current.layer)
        clickedMarkRef.current.layer = null
      }

      boardInstance.addLayer(layer, 999)
      ctx.clearRect(0, 0, layer.element.width, layer.element.height)
      ctx.beginPath()
      ctx.arc(xr, yr, sr * 1.3 , 0, 2 * Math.PI)
      ctx.lineWidth = sr * 0.4
      ctx.strokeStyle = "rgb(255 255 255 / 60%)"
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(xr, yr, sr, 0, 2 * Math.PI)
      ctx.lineWidth = sr * 0.4
      ctx.strokeStyle = "#fff"
      ctx.stroke()

      clickedMarkRef.current = {x: xr, y: yr, layer: layer}
    }

    // 着手選択マークを表示
    if (clickedMarkRef.current) {
      const coordinate = clickedMarkRef.current.coordinate
      if (results[coordinate]) {
        addClickedMarkLayer(clickedMarkRef.current.x, clickedMarkRef.current.y)
        clickedMarkRef.current.coordinate = coordinate
      }
    }

    // 以前のクリックハンドラーを削除
    if (resultClickHandlerRef.current) {
      boardInstance.removeEventListener('click', resultClickHandlerRef.current)
    }

    // 新しいクリックハンドラーを定義して保存
    resultClickHandlerRef.current = (x: number, y: number) => {
      const coordinate = wgoToSgfCoords(x, y)

      if (results[coordinate]) {
        showAnswerDetails(coordinate, results[coordinate])

        // 着手選択マークを表示
        addClickedMarkLayer(boardInstance.getX(x), boardInstance.getX(y))
        clickedMarkRef.current.coordinate = coordinate

      } else {
        console.log('No result found for coordinate:', coordinate)
      }
    }

    // クリック時の詳細表示
    boardInstance.addEventListener('click', resultClickHandlerRef.current)
  }

  // 座標変換（公式座標システム準拠）
  const sgfToWgoCoords = (sgfCoord: string): { x: number; y: number } => {
    if (!sgfCoord || sgfCoord.length !== 2) return { x: -1, y: -1 }

    const x = sgfCoord.charCodeAt(0) - 'a'.charCodeAt(0) // a=0, b=1, ...
    const y = sgfCoord.charCodeAt(1) - 'a'.charCodeAt(0)

    return { x, y }
  }

  const wgoToSgfCoords = (x: number, y: number): string => {
    return String.fromCharCode('a'.charCodeAt(0) + x) + String.fromCharCode('a'.charCodeAt(0) + y)
  }

  // 得票数による色分け
  const getColorByVotes = (votes: number): string => {
    if (votes >= 10) return '#ff4757' // 赤色（10票以上）
    if (votes >= 5) return '#ffa502' // 橙色（5-9票）
    return '#57a4ff' // 青色（1-4票）
  }

  // 回答詳細表示（フィルタリングされた回答のみを送信）
  const showAnswerDetails = (coordinate: string, data: { votes: number; answers: any[] }) => {
    const displayCoord = sgfToDisplayCoordinate(coordinate)

    // フィルタリングされた回答データをそのまま送信
    const event = new CustomEvent('showAnswerDetails', {
      detail: { coordinate: displayCoord, data },
    })
    window.dispatchEvent(event)
  }

  // SGF座標を標準囲碁記法（A1〜T19）に変換
  const sgfToDisplayCoordinate = (sgfCoord: string): string => {
    if (!sgfCoord || sgfCoord.length !== 2) return ''

    const x = sgfCoord.charCodeAt(0) - 'a'.charCodeAt(0)
    const y = sgfCoord.charCodeAt(1) - 'a'.charCodeAt(0)

    const letters = 'ABCDEFGHJKLMNOPQRST' // I除く
    const letter = letters[x]
    const number = 19 - y // SGFは上から下、表示は下から上

    return `${letter}${number}`
  }

  if (!isWgoLoaded) {
    return (
      <div
        className="igomon-board-loading"
        style={{
          width: '360px',
          height: '360px',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0f0f0',
        }}
      >
        <p>WGo.jsを読み込み中...</p>
      </div>
    )
  }

  return (
    <div
      className="igomon-board-container"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <div
        ref={boardRef}
        className="igomon-board"
        style={{
          position: 'relative',
          width: '360px',
          height: '360px',
          border: '1px solid #333',
          backgroundColor: '#DEB887', // フォールバックの背景色
        }}
      />
      {showClickable && (
        <p className="board-instruction">盤面をクリックして着手点を選択してください</p>
      )}
    </div>
  )
}
