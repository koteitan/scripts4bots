# MyPKM Skill

Personal Knowledge Management — 1単語1アイテムの用語辞書。SQLite ベース、Obsidian 互換 [[wikilink]]。

## When to use

Use when the user asks to:
- 単語や用語を記録・検索・管理する
- 知識ベースに単語を追加・参照・削除する
- 関連語のリンクを張る

## Setup

```bash
cd scripts
# Python 3 の sqlite3 モジュールを使用（追加インストール不要）
```

## Available Commands

| Command | Description |
|---------|-------------|
| `mypkm init` | データベースを初期化 |
| `mypkm ls` | 全単語の一覧 |
| `mypkm put "<title>" -d "<desc>" [-r "a,b,c"]` | 単語を追加/更新（upsert） |
| `mypkm get "<title>"` | 単語と related 3件を表示 |
| `mypkm get "<title>" -1` | 単語のみ表示 |
| `mypkm rm "<title>"` | 単語を削除 |

## Usage Examples

### 初期化
```bash
cd scripts
python3 mypkm init
```

### 単語を追加
```bash
python3 mypkm put "Docker" -d "Dockerとはコンテナ型仮想化プラットフォームである。" -r "コンテナ,イメージ"
```

### 単語を参照
```bash
python3 mypkm get "Docker"
```
出力例:
```
Docker:Dockerとは[[コンテナ]]型仮想化プラットフォームである。
コンテナ:コンテナとはアプリケーションとその依存関係をパッケージ化した実行単位である。
イメージ:イメージとはコンテナの読み取り専用テンプレートである。
```

### related だけ追加
```bash
python3 mypkm put "Docker" -r "Kubernetes"
```

### 単語のみ表示
```bash
python3 mypkm get "Docker" -1
```

### 一覧
```bash
python3 mypkm ls
```

### 削除
```bash
python3 mypkm rm "Docker"
```

## Notes

- description 内の既存単語は自動的に [[wikilink]] に変換される
- related を追加すると、相手側にも自動的にバックリンクが張られる
- データベースは `scripts/mypkm.db` に保存される
