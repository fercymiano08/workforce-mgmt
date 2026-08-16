function PageHeader({ title, subtitle }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
    </header>
  )
}

export default PageHeader
