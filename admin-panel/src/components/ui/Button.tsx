import React from 'react'
import { VariantProps, cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'ui-btn',
  {
    variants: {
      variant: {
        default: 'ui-btn-default',
        solid: 'ui-btn-solid',
        ghost: 'ui-btn-ghost',
      },
      size: {
        default: 'ui-btn-size-default',
        sm: 'ui-btn-size-sm',
        lg: 'ui-btn-size-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  neon?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, neon = true, size, variant, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      >
        <span
          className={cn(
            'ui-btn-neon ui-btn-neon-top',
            neon && 'is-visible'
          )}
        />
        {children}
        <span
          className={cn(
            'ui-btn-neon ui-btn-neon-bottom',
            neon && 'is-visible'
          )}
        />
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button, buttonVariants }
