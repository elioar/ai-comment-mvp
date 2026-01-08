import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Facebook account access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'facebook',
      },
      select: {
        access_token: true,
      },
    });

    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'No Facebook account connected' },
        { status: 400 }
      );
    }

    console.log('[Ad Accounts API] Fetching all ad accounts...');

    // Fetch all ad accounts from /me/adaccounts
    const adAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${account.access_token}&fields=id,account_id,name,currency,timezone_name,business_name,account_status&limit=100`;
    const adAccountsResponse = await fetch(adAccountsUrl);

    if (!adAccountsResponse.ok) {
      const errorText = await adAccountsResponse.text();
      const errorMessage = errorText.substring(0, 300);
      console.error(`❌ [Ad Accounts API] Failed to fetch ad accounts: ${errorMessage}`);
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch ad accounts',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        { status: adAccountsResponse.status }
      );
    }

    const adAccountsData = await adAccountsResponse.json();
    const adAccounts = adAccountsData.data || [];

    // Log raw data for debugging
    if (adAccounts.length > 0) {
      console.log('[Ad Accounts API] Raw ad accounts data:');
      adAccounts.slice(0, 3).forEach((acc: any, idx: number) => {
        console.log(`  [${idx + 1}] Full data:`, JSON.stringify(acc, null, 2));
      });
    }

    // Filter: Only return ad account with business_name "Elyon Mon IKE" or id "act_269316045245432"
    const targetBusinessName = 'Elyon Mon IKE';
    const targetAdAccountId = 'act_269316045245432';
    
    const filteredAdAccounts = adAccounts.filter((acc: any) => {
      return acc.business_name === targetBusinessName || acc.id === targetAdAccountId;
    });

    console.log(`[Ad Accounts API] Filtering: Only showing ad accounts with business_name "${targetBusinessName}" or id "${targetAdAccountId}"`);
    console.log(`[Ad Accounts API] Total ad accounts found: ${adAccounts.length}, Filtered: ${filteredAdAccounts.length}`);

    // Normalize the ad account IDs
    // The 'id' field is unique (e.g., "act_123456789")
    // The 'account_id' field is the numeric part (e.g., "123456789")
    // We should use 'id' as the unique identifier, but normalize it by removing 'act_' prefix for storage
    const normalizedAdAccounts = filteredAdAccounts.map((acc: any) => {
      // Use the 'id' field as the primary identifier (it's always unique)
      // Remove 'act_' prefix for storage/display consistency
      const accountId = acc.id?.replace(/^act_/i, '') || acc.account_id || acc.id;
      
      return {
        id: acc.id, // Full ID with 'act_' prefix (unique identifier)
        accountId: accountId, // Normalized ID without 'act_' prefix (for API calls)
        name: acc.name || `Ad Account ${accountId}`,
        currency: acc.currency,
        timezone: acc.timezone_name,
        businessName: acc.business_name,
        status: acc.account_status,
      };
    });

    console.log(`✅ [Ad Accounts API] Found ${normalizedAdAccounts.length} ad account(s) after filtering`);
    normalizedAdAccounts.forEach((acc: { id: string; accountId: string; name: string; businessName?: string }, idx: number) => {
      console.log(`  [${idx + 1}] ${acc.name} - ID: ${acc.id}, Account ID: ${acc.accountId}, Business: ${acc.businessName}`);
    });

    return NextResponse.json({
      success: true,
      adAccounts: normalizedAdAccounts,
      total: normalizedAdAccounts.length,
    });
  } catch (error: any) {
    console.error('[Ad Accounts API] Error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
