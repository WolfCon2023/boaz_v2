import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http, getApiUrl } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { useToast } from '@/components/Toast'
import { KBHelpButton } from '@/components/KBHelpButton'

type SocialPlatform = 'facebook' | 'twitter' | 'linkedin' | 'instagram'
type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed'

type SocialAccount = {
  _id: string
  platform: SocialPlatform
  accountName: string
  accountId: string
  username?: string
  profileImage?: string
  status: 'active' | 'disconnected' | 'expired' | 'error'
  followerCount?: number
  lastSync?: string
  createdAt: string
  updatedAt: string
}

type SocialPost = {
  _id: string
  content: string
  platforms: SocialPlatform[]
  accountIds: string[]
  images?: string[]
  videoUrl?: string
  link?: string
  linkTitle?: string
  linkDescription?: string
  hashtags?: string[]
  status: PostStatus
  scheduledFor?: string
  publishedAt?: string
  campaignId?: string
  metrics?: {
    [platform: string]: {
      likes?: number
      shares?: number
      comments?: number
      clicks?: number
      reach?: number
      impressions?: number
    }
  }
  createdAt: string
  updatedAt: string
}

export default function MarketingSocial() {
  const [tab, setTab] = React.useState<'composer' | 'calendar' | 'accounts' | 'analytics'>('composer')
  
  return (
    <div className="space-y-6">
      <CRMNav />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Social Media</h1>
            <KBHelpButton href="/apps/crm/support/kb?q=social-media" ariaLabel="Open Social Media help" title="Knowledge Base" />
          </div>
          <p className="text-sm text-[color:var(--color-text-muted)] mt-1">
            Manage and schedule posts across all your social platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('composer')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='composer'?'bg-[color:var(--color-muted)]':''}`}>
            ✍️ Composer
          </button>
          <button onClick={() => setTab('calendar')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='calendar'?'bg-[color:var(--color-muted)]':''}`}>
            📅 Calendar
          </button>
          <button onClick={() => setTab('accounts')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='accounts'?'bg-[color:var(--color-muted)]':''}`}>
            🔗 Accounts
          </button>
          <button onClick={() => setTab('analytics')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='analytics'?'bg-[color:var(--color-muted)]':''}`}>
            📊 Analytics
          </button>
        </div>
      </div>
      {tab === 'composer' && <ComposerTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}

function ComposerTab() {
  const qc = useQueryClient()
  const toast = useToast()
  
  const [content, setContent] = React.useState('')
  const [selectedPlatforms, setSelectedPlatforms] = React.useState<SocialPlatform[]>([])
  const [selectedAccounts, setSelectedAccounts] = React.useState<string[]>([])
  const [link, setLink] = React.useState('')
  const [hashtags, setHashtags] = React.useState('')
  const [scheduleDate, setScheduleDate] = React.useState('')
  const [scheduleTime, setScheduleTime] = React.useState('')
  const [images, setImages] = React.useState<string[]>([])
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const { data: accountsData } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await http.get('/api/marketing/social/accounts')
      return res.data as { data: { items: SocialAccount[] } }
    },
  })
  
  const accounts = accountsData?.data.items ?? []
  const activeAccounts = accounts.filter((a: SocialAccount) => a.status === 'active')
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    setUploading(true)
    const uploadedUrls: string[] = []
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('image', file)
        
        const res = await http.post('/api/marketing/images/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        
        if (res.data?.data?.url) {
          // Convert relative URL to absolute URL with API domain
          const relativeUrl = res.data.data.url
          const absoluteUrl = relativeUrl.startsWith('http') ? relativeUrl : getApiUrl(relativeUrl)
          uploadedUrls.push(absoluteUrl)
        }
      }
      
      setImages([...images, ...uploadedUrls])
      toast.showToast(`${uploadedUrls.length} image(s) uploaded successfully!`, 'success')
    } catch (err: any) {
      toast.showToast(err?.response?.data?.error || 'Failed to upload images', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }
  
  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }
  
  const createPost = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/marketing/social/posts', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] })
      toast.showToast('Post created successfully!', 'success')
      // Reset form
      setContent('')
      setSelectedPlatforms([])
      setSelectedAccounts([])
      setLink('')
      setHashtags('')
      setScheduleDate('')
      setScheduleTime('')
      setImages([])
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to create post', 'error')
    },
  })
  
  const togglePlatform = (platform: SocialPlatform) => {
    if (selectedPlatforms.includes(platform)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform))
      // Remove accounts from this platform
      const platformAccountIds = activeAccounts.filter((a: SocialAccount) => a.platform === platform).map((a: SocialAccount) => a._id)
      setSelectedAccounts(selectedAccounts.filter(id => !platformAccountIds.includes(id)))
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform])
      // Auto-select first account from this platform
      const firstAccount = activeAccounts.find((a: SocialAccount) => a.platform === platform)
      if (firstAccount && !selectedAccounts.includes(firstAccount._id)) {
        setSelectedAccounts([...selectedAccounts, firstAccount._id])
      }
    }
  }
  
  const toggleAccount = (accountId: string) => {
    if (selectedAccounts.includes(accountId)) {
      setSelectedAccounts(selectedAccounts.filter(id => id !== accountId))
    } else {
      setSelectedAccounts([...selectedAccounts, accountId])
    }
  }
  
  const getCharLimit = (platform: SocialPlatform): number => {
    const limits = { facebook: 63206, twitter: 280, linkedin: 3000, instagram: 2200 }
    return limits[platform]
  }
  
  const getCharCount = () => {
    if (selectedPlatforms.length === 0) return content.length
    const limits = selectedPlatforms.map(p => getCharLimit(p))
    return Math.min(...limits)
  }
  
  const handleSubmit = (status: 'draft' | 'scheduled' | 'published') => {
    if (!content.trim()) {
      toast.showToast('Please enter content', 'error')
      return
    }
    if (selectedAccounts.length === 0) {
      toast.showToast('Please select at least one account', 'error')
      return
    }
    
    let scheduledFor: string | undefined
    if (status === 'scheduled' && scheduleDate && scheduleTime) {
      scheduledFor = `${scheduleDate}T${scheduleTime}:00.000Z`
    }
    
    const hashtagArray = hashtags.split(/[\s,]+/).filter(h => h.trim().startsWith('#')).map(h => h.trim())
    
    createPost.mutate({
      content,
      platforms: selectedPlatforms,
      accountIds: selectedAccounts,
      images: images.length > 0 ? images : undefined,
      link: link || undefined,
      hashtags: hashtagArray.length > 0 ? hashtagArray : undefined,
      status,
      scheduledFor,
    })
  }
  
  const platformIcons = {
    facebook: '📘',
    twitter: '🐦',
    linkedin: '💼',
    instagram: '📸',
  }
  
  const platformColors = {
    facebook: 'bg-blue-500',
    twitter: 'bg-sky-400',
    linkedin: 'bg-blue-700',
    instagram: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500',
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Composer */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="text-lg font-semibold mb-4">Create Post</h2>
          
          {/* Platform Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select Platforms</label>
            <div className="flex gap-2">
              {(['facebook', 'twitter', 'linkedin', 'instagram'] as SocialPlatform[]).map(platform => (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    selectedPlatforms.includes(platform)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                  }`}
                >
                  <span className="text-xl">{platformIcons[platform]}</span>
                  <span className="capitalize text-sm">{platform}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Account Selection */}
          {selectedPlatforms.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Select Accounts</label>
              <div className="space-y-2">
                {selectedPlatforms.map(platform => {
                  const platformAccounts = activeAccounts.filter((a: SocialAccount) => a.platform === platform)
                  if (platformAccounts.length === 0) {
                    return (
                      <div key={platform} className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                        No {platform} accounts connected. <a href="#" className="underline">Connect one</a>
                      </div>
                    )
                  }
                  return platformAccounts.map((account: SocialAccount) => (
                    <label key={account._id} className="flex items-center gap-2 p-2 rounded hover:bg-[color:var(--color-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAccounts.includes(account._id)}
                        onChange={() => toggleAccount(account._id)}
                        className="rounded"
                      />
                      <div className={`w-8 h-8 rounded-full ${platformColors[account.platform]} flex items-center justify-center text-white`}>
                        {platformIcons[account.platform]}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{account.accountName}</div>
                        {account.username && (
                          <div className="text-xs text-[color:var(--color-text-muted)]">@{account.username}</div>
                        )}
                      </div>
                      {account.followerCount && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {account.followerCount.toLocaleString()} followers
                        </div>
                      )}
                    </label>
                  ))
                })}
              </div>
            </div>
          )}
          
          {/* Content */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Content</label>
              <span className={`text-xs ${content.length > getCharCount() ? 'text-red-600' : 'text-[color:var(--color-text-muted)]'}`}>
                {content.length} / {getCharCount()}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              rows={8}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm resize-none"
            />
          </div>
          
          {/* Images */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Images (Optional)</label>
            <div className="space-y-3">
              {/* Upload Button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || images.length >= 4}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <span>📷</span>
                      <span>Add Images</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
                  Max 4 images, 10MB each (JPEG, PNG, GIF, WebP)
                </p>
              </div>
              
              {/* Image Previews */}
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {images.map((imageUrl, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={imageUrl}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-[color:var(--color-border)]"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Link */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Link (Optional)</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          
          {/* Hashtags */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Hashtags (Optional)</label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#marketing #socialmedia"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
              Separate with spaces or commas
            </p>
          </div>
          
          {/* Schedule */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Schedule (Optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={createPost.isPending}
              className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
            >
              Save as Draft
            </button>
            {scheduleDate && scheduleTime ? (
              <button
                onClick={() => handleSubmit('scheduled')}
                disabled={createPost.isPending}
                className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Schedule Post
              </button>
            ) : (
              <button
                onClick={() => handleSubmit('published')}
                disabled={createPost.isPending}
                className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {createPost.isPending ? 'Publishing...' : 'Publish Now'}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Preview Panel */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <h3 className="text-sm font-semibold mb-3">Preview</h3>
          {selectedPlatforms.length === 0 ? (
            <div className="text-sm text-[color:var(--color-text-muted)] text-center py-8">
              Select platforms to see preview
            </div>
          ) : (
            <div className="space-y-4">
              {selectedPlatforms.map(platform => (
                <div key={platform} className="border border-[color:var(--color-border)] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full ${platformColors[platform]} flex items-center justify-center text-white text-xs`}>
                      {platformIcons[platform]}
                    </div>
                    <span className="text-xs font-medium capitalize">{platform}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {content || <span className="text-[color:var(--color-text-muted)]">Your content will appear here...</span>}
                  </div>
                  {images.length > 0 && (
                    <div className={`mt-2 grid gap-1 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : images.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`Preview ${i + 1}`}
                          className="w-full h-24 object-cover rounded"
                        />
                      ))}
                    </div>
                  )}
                  {link && (
                    <div className="mt-2 p-2 bg-[color:var(--color-muted)] rounded text-xs truncate">
                      🔗 {link}
                    </div>
                  )}
                  {hashtags && (
                    <div className="mt-2 text-xs text-blue-600">
                      {hashtags.split(/[\s,]+/).filter(h => h.trim()).map((tag, i) => (
                        <span key={i} className="mr-1">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Tips */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="font-semibold mb-2 text-blue-900">💡 Pro Tips</p>
          <ul className="text-blue-800 space-y-1 text-xs">
            <li>• Keep it concise for Twitter (280 chars)</li>
            <li>• Use emojis to increase engagement</li>
            <li>• Add 3-5 relevant hashtags</li>
            <li>• Include a call-to-action</li>
            <li>• Post during peak hours (9am-3pm)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function CalendarTab() {
  const { data } = useQuery({
    queryKey: ['social-posts'],
    queryFn: async () => {
      const res = await http.get('/api/marketing/social/posts')
      return res.data as { data: { items: SocialPost[] } }
    },
  })
  
  const posts = data?.data.items ?? []
  const scheduledPosts = posts.filter((p: SocialPost) => p.status === 'scheduled' && p.scheduledFor)
  
  // Group by date
  const groupedByDate = scheduledPosts.reduce((acc: Record<string, SocialPost[]>, post: SocialPost) => {
    const date = post.scheduledFor ? new Date(post.scheduledFor).toISOString().split('T')[0] : 'unscheduled'
    if (!acc[date]) acc[date] = []
    acc[date].push(post)
    return acc
  }, {} as Record<string, SocialPost[]>)
  
  const platformIcons = { facebook: '📘', twitter: '🐦', linkedin: '💼', instagram: '📸' }
  
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <h2 className="text-lg font-semibold mb-4">📅 Scheduled Posts</h2>
        {Object.keys(groupedByDate).length === 0 ? (
          <div className="text-center text-[color:var(--color-text-muted)] py-8">
            No scheduled posts. Create one in the Composer tab!
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, posts]) => (
              <div key={date}>
                <h3 className="text-sm font-semibold mb-2">
                  {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
                <div className="space-y-2">
                  {posts.sort((a: SocialPost, b: SocialPost) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1)).map((post: SocialPost) => (
                    <div key={post._id} className="border border-[color:var(--color-border)] rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex gap-1">
                          {post.platforms.map((platform: SocialPlatform) => (
                            <span key={platform} className="text-lg" title={platform}>{platformIcons[platform]}</span>
                          ))}
                        </div>
                        <span className="text-xs text-[color:var(--color-text-muted)]">
                          {post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">{post.content}</p>
                      {post.images && post.images.length > 0 && (
                        <div className="mt-2 flex gap-1">
                          {post.images.slice(0, 3).map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt={`Post image ${i + 1}`}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ))}
                          {post.images.length > 3 && (
                            <div className="w-12 h-12 bg-[color:var(--color-muted)] rounded flex items-center justify-center text-xs">
                              +{post.images.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [showConnectForm, setShowConnectForm] = React.useState(false)
  const [newPlatform, setNewPlatform] = React.useState<SocialPlatform>('facebook')
  const [newAccountName, setNewAccountName] = React.useState('')
  const [newAccountId, setNewAccountId] = React.useState('')
  const [newUsername, setNewUsername] = React.useState('')
  const [newAccessToken, setNewAccessToken] = React.useState('')
  
  const { data } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await http.get('/api/marketing/social/accounts')
      return res.data as { data: { items: SocialAccount[] } }
    },
  })
  
  const accounts = data?.data.items ?? []
  
  const connectAccount = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/marketing/social/accounts', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-accounts'] })
      toast.showToast('Account connected successfully!', 'success')
      setShowConnectForm(false)
      setNewAccountName('')
      setNewAccountId('')
      setNewUsername('')
      setNewAccessToken('')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to connect account', 'error')
    },
  })
  
  const disconnectAccount = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/marketing/social/accounts/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-accounts'] })
      toast.showToast('Account disconnected', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to disconnect account', 'error')
    },
  })
  
  const handleConnect = () => {
    if (!newAccountName || !newAccountId || !newAccessToken) {
      toast.showToast('Please fill in all required fields (Name, ID, and Access Token)', 'error')
      return
    }
    connectAccount.mutate({
      platform: newPlatform,
      accountName: newAccountName,
      accountId: newAccountId,
      username: newUsername || undefined,
      accessToken: newAccessToken,
      status: 'active',
    })
  }
  
  const platformIcons = { facebook: '📘', twitter: '🐦', linkedin: '💼', instagram: '📸' }
  const platformColors = {
    facebook: 'bg-blue-500',
    twitter: 'bg-sky-400',
    linkedin: 'bg-blue-700',
    instagram: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500',
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">🔗 Connected Accounts</h2>
        <button
          onClick={() => setShowConnectForm(!showConnectForm)}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 text-sm hover:from-indigo-600 hover:to-purple-700 flex items-center gap-2"
        >
          <span className="text-lg">➕</span> Connect Account
        </button>
      </div>
      
      {showConnectForm && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h3 className="text-sm font-semibold mb-4">Connect New Account</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Platform</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as SocialPlatform)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
              >
                <option value="facebook">Facebook</option>
                <option value="twitter">Twitter / X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Account Name *</label>
              <input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="e.g., My Business Page"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Account ID * (from platform)</label>
              <input
                type="text"
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
                placeholder="Platform-specific account ID"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Username (optional)</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="@username"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Access Token *</label>
              <textarea
                value={newAccessToken}
                onChange={(e) => setNewAccessToken(e.target.value)}
                placeholder="Paste your platform access token here (from Facebook/Twitter/LinkedIn developer portal)"
                rows={3}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
                This token will be used to publish posts to your account. Keep it secure!
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={connectAccount.isPending}
                className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {connectAccount.isPending ? 'Connecting...' : 'Connect'}
              </button>
              <button
                onClick={() => setShowConnectForm(false)}
                className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-2">ℹ️ How to Get Access Tokens</p>
            <div className="space-y-2 text-xs">
              <p><strong>Facebook:</strong> Go to Facebook Developers → Your App → Tools → Graph API Explorer → Get Page Access Token</p>
              <p><strong>Twitter:</strong> Go to Twitter Developer Portal → Your App → Keys and Tokens → Generate Access Token</p>
              <p><strong>LinkedIn:</strong> Use OAuth 2.0 flow to get an access token (requires API access)</p>
              <p className="text-yellow-700 dark:text-yellow-300 font-semibold mt-2">⚠️ Keep your access tokens secure! Never share them publicly.</p>
            </div>
          </div>
        </div>
      )}
      
      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-lg font-semibold mb-2">No Accounts Connected</h3>
          <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
            Connect your social media accounts to start posting
          </p>
          <button
            onClick={() => setShowConnectForm(true)}
            className="rounded-lg bg-blue-600 text-white px-6 py-2 text-sm hover:bg-blue-700"
          >
            Connect Your First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account: SocialAccount) => (
            <div key={account._id} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-full ${platformColors[account.platform]} flex items-center justify-center text-white text-2xl`}>
                  {platformIcons[account.platform]}
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  account.status === 'active' ? 'bg-green-100 text-green-800' :
                  account.status === 'disconnected' ? 'bg-gray-100 text-gray-800' :
                  account.status === 'expired' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {account.status}
                </span>
              </div>
              <h3 className="font-semibold mb-1">{account.accountName}</h3>
              {account.username && (
                <p className="text-sm text-[color:var(--color-text-muted)] mb-2">@{account.username}</p>
              )}
              {account.followerCount && (
                <p className="text-sm text-[color:var(--color-text-muted)] mb-3">
                  {account.followerCount.toLocaleString()} followers
                </p>
              )}
              <button
                onClick={() => {
                  if (confirm(`Disconnect ${account.accountName}?`)) {
                    disconnectAccount.mutate(account._id)
                  }
                }}
                className="w-full rounded-lg border border-red-300 text-red-600 px-3 py-1 text-sm hover:bg-red-50"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AnalyticsTab() {
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  
  const { data } = useQuery({
    queryKey: ['social-analytics', startDate, endDate],
    queryFn: async () => {
      const params: any = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const res = await http.get('/api/marketing/social/analytics', { params })
      return res.data as { data: any }
    },
  })
  
  const analytics = data?.data
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-2xl mb-1">📝</div>
          <div className="text-2xl font-bold">{analytics?.totalPosts || 0}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Total Posts</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-2xl mb-1">❤️</div>
          <div className="text-2xl font-bold">{analytics?.totalEngagement.likes?.toLocaleString() || 0}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Likes</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-2xl mb-1">🔄</div>
          <div className="text-2xl font-bold">{analytics?.totalEngagement.shares?.toLocaleString() || 0}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Shares</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-2xl mb-1">💬</div>
          <div className="text-2xl font-bold">{analytics?.totalEngagement.comments?.toLocaleString() || 0}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">Comments</div>
        </div>
      </div>
      
      {/* By Platform */}
      {analytics?.byPlatform && Object.keys(analytics.byPlatform).length > 0 && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h3 className="text-lg font-semibold mb-4">Performance by Platform</h3>
          <div className="space-y-4">
            {Object.entries(analytics.byPlatform).map(([platform, metrics]: [string, any]) => (
              <div key={platform} className="border-b border-[color:var(--color-border)] pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium capitalize">{platform}</h4>
                  <span className="text-sm text-[color:var(--color-text-muted)]">{metrics.posts} posts</span>
                </div>
                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="text-[color:var(--color-text-muted)]">Likes</div>
                    <div className="font-medium">{metrics.likes?.toLocaleString() || 0}</div>
                  </div>
                  <div>
                    <div className="text-[color:var(--color-text-muted)]">Shares</div>
                    <div className="font-medium">{metrics.shares?.toLocaleString() || 0}</div>
                  </div>
                  <div>
                    <div className="text-[color:var(--color-text-muted)]">Comments</div>
                    <div className="font-medium">{metrics.comments?.toLocaleString() || 0}</div>
                  </div>
                  <div>
                    <div className="text-[color:var(--color-text-muted)]">Clicks</div>
                    <div className="font-medium">{metrics.clicks?.toLocaleString() || 0}</div>
                  </div>
                  <div>
                    <div className="text-[color:var(--color-text-muted)]">Reach</div>
                    <div className="font-medium">{metrics.reach?.toLocaleString() || 0}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {(!analytics || analytics.totalPosts === 0) && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold mb-2">No Analytics Yet</h3>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Publish some posts to see your performance metrics
          </p>
        </div>
      )}
    </div>
  )
}

