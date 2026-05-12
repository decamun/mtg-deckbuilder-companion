import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { IdlebrewLogo } from '@/components/IdlebrewLogo'

describe('IdlebrewLogo', () => {
  it('renders an accessible branded svg', () => {
    render(<IdlebrewLogo className="size-8" />)

    const logo = screen.getByLabelText('idlebrew logo')

    expect(logo.tagName).toBe('svg')
    expect(logo.getAttribute('class')).toContain('size-8')
    expect(logo.querySelectorAll('path')).toHaveLength(6)
  })
})
