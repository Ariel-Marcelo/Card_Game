import Link from 'next/link'
import Layout from '../components/Layout'

const IndexPage = () => (
  <Layout title="Home | Next.js + TypeScript Example">
    <h1>Hello Next.js 👋</h1>
      <h3>Deber 2 Bimestre</h3>
        <h4>Juego de cartas</h4>
    <p>
      <Link href="/game">Start Game </Link>
    </p>
  </Layout>
)

export default IndexPage
