use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZ8kQJ8WZy9V1wJ6r3g4x");

#[program]
pub mod matchlink {
    use super::*;

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: [u8; 32],
        recipient: Pubkey,
        expires_at: i64,
        match_bps: u16,
        max_match_per_donation: u64,
        max_match_per_wallet: u64,
    ) -> Result<()> {
        require!(match_bps <= 10_000, MatchLinkError::InvalidMatchRate);
        require!(max_match_per_donation > 0, MatchLinkError::InvalidMatchCap);
        require!(max_match_per_wallet > 0, MatchLinkError::InvalidWalletCap);
        require!(expires_at > Clock::get()?.unix_timestamp, MatchLinkError::CampaignExpired);

        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.campaign_id = campaign_id;
        campaign.recipient = recipient;
        campaign.mint = ctx.accounts.mint.key();
        campaign.bump = ctx.bumps.campaign;
        campaign.expires_at = expires_at;
        campaign.match_bps = match_bps;
        campaign.max_match_per_donation = max_match_per_donation;
        campaign.max_match_per_wallet = max_match_per_wallet;
        campaign.total_donated = 0;
        campaign.total_matched = 0;
        Ok(())
    }

    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        require!(amount > 0, MatchLinkError::ZeroAmount);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.campaign.expires_at, MatchLinkError::CampaignExpired);
        let cpi = TransferChecked {
            from: ctx.accounts.sponsor_tokens.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        token::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi), amount, ctx.accounts.mint.decimals)
    }

    pub fn donate_and_match(ctx: Context<DonateAndMatch>, amount: u64) -> Result<()> {
        require!(amount > 0, MatchLinkError::ZeroAmount);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.campaign.expires_at, MatchLinkError::CampaignExpired);
        require_keys_neq!(ctx.accounts.donor.key(), ctx.accounts.recipient.key(), MatchLinkError::SelfDonation);

        let proportional = (amount as u128)
            .checked_mul(ctx.accounts.campaign.match_bps as u128)
            .ok_or(MatchLinkError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(MatchLinkError::MathOverflow)?;
        let wallet_remaining = ctx.accounts.campaign.max_match_per_wallet
            .saturating_sub(ctx.accounts.donor_stats.matched_total);
        let match_amount = (proportional as u64)
            .min(ctx.accounts.campaign.max_match_per_donation)
            .min(wallet_remaining)
            .min(ctx.accounts.vault.amount);

        let donor_transfer = TransferChecked {
            from: ctx.accounts.donor_tokens.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_tokens.to_account_info(),
            authority: ctx.accounts.donor.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), donor_transfer),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        if match_amount > 0 {
            let campaign_id = ctx.accounts.campaign.campaign_id;
            let authority = ctx.accounts.campaign.authority;
            let bump = [ctx.accounts.campaign.bump];
            let signer_seeds: &[&[u8]] = &[b"campaign", authority.as_ref(), campaign_id.as_ref(), &bump];
            let signer = &[signer_seeds];
            let match_transfer = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_tokens.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            };
            token::transfer_checked(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), match_transfer, signer),
                match_amount,
                ctx.accounts.mint.decimals,
            )?;
        }

        let campaign = &mut ctx.accounts.campaign;
        campaign.total_donated = campaign.total_donated.checked_add(amount).ok_or(MatchLinkError::MathOverflow)?;
        campaign.total_matched = campaign.total_matched.checked_add(match_amount).ok_or(MatchLinkError::MathOverflow)?;
        ctx.accounts.donor_stats.campaign = campaign.key();
        ctx.accounts.donor_stats.donor = ctx.accounts.donor.key();
        ctx.accounts.donor_stats.matched_total = ctx.accounts.donor_stats.matched_total
            .checked_add(match_amount).ok_or(MatchLinkError::MathOverflow)?;
        emit!(DonationMatched {
            campaign: campaign.key(),
            donor: ctx.accounts.donor.key(),
            amount,
            matched: match_amount,
        });
        Ok(())
    }

    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        require!(Clock::get()?.unix_timestamp >= ctx.accounts.campaign.expires_at, MatchLinkError::CampaignStillOpen);
        let residual = ctx.accounts.vault.amount;
        if residual > 0 {
            let campaign_id = ctx.accounts.campaign.campaign_id;
            let authority = ctx.accounts.campaign.authority;
            let bump = [ctx.accounts.campaign.bump];
            let signer_seeds: &[&[u8]] = &[b"campaign", authority.as_ref(), campaign_id.as_ref(), &bump];
            let signer = &[signer_seeds];
            let return_transfer = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.sponsor_tokens.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            };
            token::transfer_checked(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), return_transfer, signer),
                residual,
                ctx.accounts.mint.decimals,
            )?;
        }
        let close = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.campaign.to_account_info(),
        };
        let campaign_id = ctx.accounts.campaign.campaign_id;
        let authority = ctx.accounts.campaign.authority;
        let bump = [ctx.accounts.campaign.bump];
        let signer_seeds: &[&[u8]] = &[b"campaign", authority.as_ref(), campaign_id.as_ref(), &bump];
        token::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), close, &[signer_seeds]))
    }
}

#[derive(Accounts)]
#[instruction(campaign_id: [u8; 32])]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [b"campaign", authority.key().as_ref(), campaign_id.as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut, has_one = authority, has_one = mint)]
    pub campaign: Account<'info, Campaign>,
    pub authority: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = authority)]
    pub sponsor_tokens: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = campaign)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DonateAndMatch<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.authority.as_ref(), campaign.campaign_id.as_ref()],
        bump = campaign.bump,
        has_one = mint
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init_if_needed,
        payer = donor,
        space = 8 + DonorStats::INIT_SPACE,
        seeds = [b"donor", campaign.key().as_ref(), donor.key().as_ref()],
        bump
    )]
    pub donor_stats: Account<'info, DonorStats>,
    /// CHECK: Must match the immutable recipient stored in the campaign.
    #[account(constraint = recipient.key() == campaign.recipient)]
    pub recipient: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = donor)]
    pub donor_tokens: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = recipient)]
    pub recipient_tokens: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = campaign)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = authority,
        seeds = [b"campaign", campaign.authority.as_ref(), campaign.campaign_id.as_ref()],
        bump = campaign.bump,
        has_one = authority,
        has_one = mint
    )]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = authority)]
    pub sponsor_tokens: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = campaign)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub authority: Pubkey,
    pub campaign_id: [u8; 32],
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub expires_at: i64,
    pub match_bps: u16,
    pub max_match_per_donation: u64,
    pub max_match_per_wallet: u64,
    pub total_donated: u64,
    pub total_matched: u64,
}

#[account]
#[derive(InitSpace)]
pub struct DonorStats {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub matched_total: u64,
}

#[event]
pub struct DonationMatched {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub matched: u64,
}

#[error_code]
pub enum MatchLinkError {
    #[msg("Match rate must be at most 100 percent")]
    InvalidMatchRate,
    #[msg("Per-donation match cap must be positive")]
    InvalidMatchCap,
    #[msg("Per-wallet match cap must be at least the per-donation cap")]
    InvalidWalletCap,
    #[msg("Campaign has expired")]
    CampaignExpired,
    #[msg("Campaign is still open")]
    CampaignStillOpen,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Donor cannot be the campaign recipient")]
    SelfDonation,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
