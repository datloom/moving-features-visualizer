import type { ReactNode } from 'react'

export function PropertyChartHeader({
  properties,
  trailing,
}: {
  readonly properties: readonly {
    readonly name: string
    readonly type: 'Measure' | 'Text' | 'IMAGE'
    readonly interpolation: string
  }[]
  readonly trailing?: ReactNode
}) {
  return (
    <header className="measure-chart-header">
      <div>
        {properties.map((property) => (
          <div key={`${property.type}:${property.name}`}>
            <h2>{property.name}</h2>
            <p>
              {property.type} · {property.interpolation} interpolation
            </p>
          </div>
        ))}
      </div>
      {trailing}
    </header>
  )
}
