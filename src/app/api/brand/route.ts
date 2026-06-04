import { NextResponse } from 'next/server';
import { getPrimaryBrand } from '@/lib/queries';
import type { BrandResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<BrandResponse>> {
  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json({ brand: null });
  }
  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      category: brand.category,
      description: brand.description,
    },
  });
}
