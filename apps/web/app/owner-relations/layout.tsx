import type { Metadata } from 'next';
import './owner-relations.css';
export const metadata: Metadata = {title:{absolute:'Owner Relations · SDS Operations'},description:'Your private financial statement portal.',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function OwnerLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <div className="owner-relations"><a className="or-skip" href="#owner-main">Skip to main content</a><header className="or-header"><a href="/owner-relations" className="or-brand"><span className="or-monogram" aria-hidden="true">SDS</span><span>SDS Operations<small>Owner Relations</small></span></a><span className="or-header-note">Your private statement portal</span></header><main id="owner-main" className="or-main">{children}</main><footer className="or-footer">Need help with a statement or your access? Contact your property manager.</footer></div>;
}
