  // ========== settings: the Decisions tab (api/automation, api/limits) and the Notifications tab (spec 1.1, 4.6)
  function decisionsTab() {
    load('automation', 'api/automation', false, 4000)
    load('live', 'api/live', false, 5000)
    const a = st.data.automation
    if (!a) return '<p class="empty" role="status">' + T('Loading…') + '</p>'
    const lim = st.data.live && st.data.live.limits
    const lock = !canWrite() || a.readOnly
    const on = !!a.autoRun
    const kindRow = (key, title, sub) => '<div class="srow' + (on ? '' : ' off') + '"><div class="sp"><b class="hi">' + title + '</b>' + (sub ? '<div class="mut sm">' + sub + '</div>' : '') + '</div><input type="checkbox" class="tgl" data-ev-change="auto-kind" data-arg="' + key + '" aria-label="' + esc(title) + '"' + (a.kinds[key] ? ' checked' : '') + (lock || !on ? ' disabled' : '') + '></div>'
    const lockRow = (title, sub) => '<div class="srow locked"><div class="sp"><b class="hi">' + ic('lock', 14) + ' ' + title + '</b><div class="mut sm">' + sub + '</div></div><span class="chip sm">' + T('No switch') + '</span></div>'
    let html = '<div><div class="sec">' + T('Decisions') + ' <small>' + T('What may go ahead without asking you again') + '</small></div>'
    html += '<div class="card" style="overflow:hidden"><div class="srow master' + (on ? ' on' : '') + '"><div class="sp"><b class="hi" style="font-size:15px">' + T('Let approved actions run by themselves') + '</b><div class="soft sm" style="margin-top:3px;line-height:1.5">' + T('A merge or a next phase that has passed its checks goes ahead once you approve it, without your assistant asking you again. You still see it on the Decisions page afterwards, with Undo for 10 minutes. Off unless you turn it on.') + '</div></div><input type="checkbox" class="tgl" data-ev-change="auto-master" aria-label="' + esc(T('Let approved actions run by themselves')) + '"' + (on ? ' checked' : '') + (lock ? ' disabled' : '') + '></div>'
    html += kindRow('merge', T('Merge into the integration branch'), T('Only after its tests and reviews passed.')) + kindRow('next-phase', T('Start the next phase'), T('Not when a phase would pass the budget warning.')) +
      lockRow(T('Build an installer'), T('Always waits for you.')) + lockRow(T('Releases'), T('Publishing, tagging and uploading always wait for you.')) + '</div>'
    if (a.readOnly) html += '<p class="msg err">' + T('This setting was written by a newer Arsenale; it cannot be changed here.') + '</p>'
    html += '<p class="note" style="margin-top:10px">' + ic('info', 13) + T('A release is the one step that cannot be taken back from this computer, so Arsenale never offers to skip your approval for it.') + '</p></div>'
    html += '<div><div class="sec">' + T('Stalled and dead runs') + ' <small>' + T('When Arsenale tells you a run needs a look') + '</small></div><div class="card pad">'
    if (!lim) html += '<p class="empty" role="status">' + T('Loading…') + '</p>'
    else {
      const num = (label, name, min, max, v, hint, off) => '<label class="fl" style="margin:0;width:250px">' + label + '<input type="number" ' + (name ? 'name="' + name + '" min="' + min + '" max="' + max + '" step="1" ' : '') + 'value="' + esc(v) + '"' + (off || !canWrite() ? ' disabled' : '') + '><span class="hint" style="font-weight:400">' + hint + '</span></label>'
      html += '<form data-evform="limits" style="display:flex;flex-direction:column;gap:16px"><div class="rw" style="gap:18px;flex-wrap:wrap;align-items:flex-start">' +
        num(T('Quiet after (minutes)'), '', 0, 0, LIVE_QUIET_MIN, T('Fixed: a soft hint only.'), true) +
        num(T('Stalled after (minutes)'), 'stallMinutes', 5, 240, lim.stallMinutes, T('5 to 240. You are told once.')) +
        num(T('Dead after (minutes)'), 'deadMinutes', 30, 10080, lim.deadMinutes, T('30 to 10080. Only for runs with no process id.')) + '</div>' +
        (canWrite() ? '<div><button type="submit" class="b pri">' + T('Save') + '</button></div>' : '') + '</form>'
      html += '<p class="mut sm" style="margin-top:12px">' + T('A run whose process has ended is closed at once. A run that is only quiet is never stopped by Arsenale.') + '</p>'
    }
    return html + '</div></div>' + msgHtml()
  }

  // ===== NOTIFY API (notify.cjs; docs/reference.md, "Notifications API"): the only place that knows the routes =====
  //   GET  api/notify -> { secrets: {phoneKey, ntfyToken, telegramToken, pushoverToken, pushoverUser: {set, from}},
  //                        secretsFile: {ownerOnly}, events: {desktop, ntfy, telegram, pushover: {question, task, budget,
  //                        stalled, findings, queueWait}}, eventDefaults, limits, expiryMin, readOnly,
  //                        ntfy | telegram | pushover: {enabled, details, testedAt, lastTest: {at, ok, reason}, lastSentAt, lastError, ...},
  //                        ntfy.buttons: false when Approve buttons are not sent (a typed topic on a public server, no token) }
  //   POST api/notify { op: 'setup', channel, server?, topic? (null: a new generated one), token?, user? } and the ops test, enable, disable,
  //                   details {on}, pair, events {events}, expiry {minutes}, signout
  // A secret is never read back: the page only learns "set" or "not set", and from where.
  // The form's field names, mapped to the names the setup op takes, per channel
  const NF_SETUP = { ntfy: { server: 'server', topic: 'topic', token: 'token' }, telegram: { botToken: 'token' }, pushover: { appToken: 'token', userKey: 'user' } }
  const NF = {
    load: (force) => load('notify', 'api/notify', force, 5000),
    state: () => st.data.notify,
    save: (channel, fields) => {
      const body = { op: 'setup', channel }
      for (const [k, v] of Object.entries(fields)) if (NF_SETUP[channel] && NF_SETUP[channel][k]) body[NF_SETUP[channel][k]] = v
      return send('api/notify', body)
    },
    test: (channel) => send('api/notify', { op: 'test', channel }),
    enable: (channel, on) => send('api/notify', { op: on ? 'enable' : 'disable', channel }),
    details: (channel, on) => send('api/notify', { op: 'details', channel, on }),
    events: (channel, events) => send('api/notify', { op: 'events', channel, events }),
    expiry: (minutes) => send('api/notify', { op: 'expiry', minutes }),
    pair: (channel) => send('api/notify', { op: 'pair', channel }),
    newTopic: () => send('api/notify', { op: 'setup', channel: 'ntfy', topic: null }),
    signout: () => send('api/notify', { op: 'signout', channel: '' }),
  }
  // ===== end of the NOTIFY API block =====

  const NF_EVENTS = [['question', 'A question is waiting for you', true], ['task', 'A task is waiting for you', true], ['budget', 'A budget alert', true], ['stalled', 'A run has been quiet too long', true], ['findings', 'A run finished with findings', true], ['queueWait', 'A long wait in the test queue', false]]
  const NF_CHANNELS = [['desktop', 'Desktop'], ['ntfy', 'ntfy'], ['telegram', 'Telegram'], ['pushover', 'Pushover']]
  const evOn = (ev, key, def) => !!(ev && typeof ev[key] === 'boolean' ? ev[key] : def)
  const evOf = (d, ch) => (d && d.events && d.events[ch]) || null
  // a secret's state: set or not, and whether an environment variable holds it (it then wins over the field)
  const sec = (d, id) => (d && d.secrets && d.secrets[id]) || { set: false, from: '' }
  // a settings file a newer Arsenale wrote is read-only here (the server refuses the writes too)
  const nfLock = () => !canWrite() || !!(NF.state() && NF.state().readOnly)
  const nfTime = (iso) => hm(iso || new Date().toISOString())
  // what the last Save / Test said, per channel (the server's own message when it refused)
  st.nres = st.nres || {}
  const setRes = (ch, kind, ok, text) => { st.nres[ch + '|' + kind] = { ok, text }; bump() }
  const resLine = (ch, kind, empty) => { const r = st.nres[ch + '|' + kind]; return r ? '<span class="' + (r.ok ? 'ok' : 'bd') + ' sm" role="status">' + esc(r.text) + '</span>' : empty ? '<span class="mut sm">' + empty + '</span>' : '' }
  /** Checks one form before it is sent, with the field name and the rule (spec 4.6, rule 38). */
  function nfCheck(ch, f) {
    const secret = (name, v) => (v && (/\s/.test(v) || Array.from(v).length > 200) ? name + ': no spaces, at most 200 characters' : '')
    if (ch === 'ntfy') {
      if (f.server && !/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(f.server) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(f.server)) return 'Server: use an https:// address, or http://localhost for a server on this computer'
      if (f.topic && !/^[A-Za-z0-9_-]{3,64}$/.test(f.topic)) return 'Topic: 3 to 64 letters, digits, - or _, no spaces'
      return secret('Access token', f.token)
    }
    if (ch === 'telegram') return secret('Bot token', f.botToken)
    if (ch === 'pushover') return secret('Application token', f.appToken) || secret('User key', f.userKey)
    return ''
  }
  function secretField(label, name, s, hint) {
    const word = !s.set ? 'not set' : s.from === 'env' ? 'set by an environment variable' : 'set'
    return '<label class="fl" style="margin:0"><span class="rw" style="gap:8px">' + label + '<span class="chip sm ' + (s.set ? 'ok' : '') + '">' + T(word) + '</span></span><input type="password" name="' + name + '" autocomplete="off" maxlength="200" dir="ltr" placeholder="' + esc(T(s.set ? 'Leave empty to keep it' : 'Paste it here')) + '"' + (nfLock() ? ' disabled' : '') + '><span class="hint" style="font-weight:400">' + hint + (s.from === 'env' ? ' ' + T('The environment variable wins over what you type here.') : '') + '</span></label>'
  }
  function channelForm(ch, c, d) {
    const lock = nfLock()
    const dis = lock ? ' disabled' : ''
    let f = ''
    if (ch === 'ntfy') {
      f += '<label class="fl" style="margin:0">' + T('Server') + '<input type="text" name="server" dir="ltr" maxlength="200" value="' + esc(c.server || '') + '" placeholder="https://ntfy.example.org"' + dis + '><span class="hint" style="font-weight:400">' + T('An https address, or a server on this computer. Questions pass through it.') + '</span></label>'
      f += '<label class="fl" style="margin:0">' + T('Topic') + '<input type="text" name="topic" dir="ltr" maxlength="64" value="' + esc(c.topic || '') + '" placeholder="' + esc(T('made for you when empty')) + '"' + dis + '><span class="hint" style="font-weight:400">' + T('Subscribe to this topic in the ntfy app. 3 to 64 letters, digits, - or _; on a public server without an access token, at least 20.') + '</span></label>'
      f += secretField(T('Access token'), 'token', sec(d, 'ntfyToken'), T('Only if your server needs one. Never shown again after saving.'))
    } else if (ch === 'telegram') {
      f += secretField(T('Bot token'), 'botToken', sec(d, 'telegramToken'), T('From BotFather. Never shown again after saving.'))
      f += '<div class="soft sm">' + (c.paired ? T('Paired with ') + '<b class="hi" dir="auto">' + esc(c.pairedName || T('one private chat')) + '</b>.' : c.pairLink ? T('Open this link on your phone within 10 minutes, and press Start in Telegram:') + '<br><a href="' + esc(c.pairLink) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan);word-break:break-all">' + esc(c.pairLink) + '</a>' : c.pairCommand ? T('Within 10 minutes, send this to your bot in a private chat:') + '<br>' + ltr(c.pairCommand) : T('Save the bot token, then pair your phone.')) + '</div>'
      f += !lock ? '<div><button type="button" class="b sm" data-ev="nf2" data-arg="pair|telegram">' + (c.paired ? T('Pair another phone') : T('Pair a phone')) + '</button></div>' : ''
    } else if (ch === 'pushover') {
      f += secretField(T('Application token'), 'appToken', sec(d, 'pushoverToken'), T('From your Pushover application page.'))
      f += secretField(T('User key'), 'userKey', sec(d, 'pushoverUser'), T('From your Pushover account page.'))
    }
    return f
  }
  function eventBoxes(ch, ev) {
    return '<div class="nev"><div class="lbl" style="margin-bottom:8px">' + T('Tell me when') + '</div>' + NF_EVENTS.map(([k, label, def]) => '<label class="rw" style="gap:10px;margin:0 0 7px;cursor:pointer"><input type="checkbox" data-ev-change="nf-event" data-arg="' + ch + '|' + k + '"' + (evOn(ev, k, def) ? ' checked' : '') + (nfLock() ? ' disabled' : '') + '><span class="soft">' + T(label) + '</span></label>').join('') + '</div>'
  }
  function desktopPanel() {
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    const d = NF.state() || {}
    const r = st.nres['desktop|test']
    return '<div class="card pad"><div class="rw" style="flex-wrap:wrap;gap:12px"><div class="sp"><b class="hi">' + T('Desktop notifications') + '</b><div class="mut sm">' + T('Shown by this browser while a dashboard tab is open.') + '</div></div>' +
      (perm === 'default' ? '<button type="button" class="b sm" data-ev="notif-perm">' + T('Allow notifications in this browser') + '</button>' : perm === 'denied' ? '<span class="chip warn">' + T('Blocked: allow them in the browser settings') + '</span>' : perm === 'unsupported' ? '<span class="chip warn">' + T('This browser has no notifications') + '</span>' : '<span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Allowed') + '</span>') +
      '<input type="checkbox" class="tgl" data-ev-change="notif" aria-label="' + T('Desktop notifications') + '"' + (notifOn() ? ' checked' : '') + '></div>' +
      '<div class="rw" style="gap:12px;margin-top:14px;flex-wrap:wrap"><button type="button" class="b sm" data-ev="nf2" data-arg="dtest|desktop"' + (perm === 'granted' ? '' : ' disabled') + '>' + T('Send test notification') + '</button>' + (r ? '<span class="' + (r.ok ? 'ok' : 'bd') + ' sm" role="status">' + esc(r.text) + '</span>' : '') + '</div>' +
      '<div style="margin-top:16px">' + eventBoxes('desktop', evOf(d, 'desktop')) + '</div></div>'
  }
  /** secretsFile.ownerOnly: true, false, or null when nothing is saved yet. */
  function nfFileWord(d) {
    const o = d.secretsFile ? d.secretsFile.ownerOnly : null
    if (o === true) return '<span class="chip ok sm">' + T('Token file: only you can read it') + '</span>'
    if (o === false) return '<span class="chip warn sm">' + T('Token file: other accounts on this computer can read it') + '</span>'
    return '<span class="chip sm">' + T('Token file: nothing saved yet') + '</span>'
  }
  function notificationsTab() {
    NF.load()
    const d = NF.state()
    if (!d) return '<p class="empty" role="status">' + T('Loading…') + '</p>' + (st.err.notify ? '<p class="msg err">' + esc(errTxt(st.err.notify)) + '</p>' : '')
    const ch = st.channel === 'desktop' || d[st.channel] ? st.channel : 'desktop'
    let html = '<div><div class="sec">' + T('Notifications') + ' <small>' + T('How you hear about a question, a stalled run or a finished job') + '</small></div>'
    if (d.readOnly) html += '<p class="msg err">' + T('These settings were written by a newer Arsenale; they cannot be changed here.') + '</p>'
    html += '<div class="rw" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">' + NF_CHANNELS.map(([k, label]) => '<button type="button" class="chip" data-ev="nchan" data-arg="' + k + '" aria-pressed="' + (ch === k) + '" style="height:32px;padding:0 14px;font-size:13.5px">' + ((d[k] && d[k].enabled) || (k === 'desktop' && notifOn() && typeof Notification !== 'undefined' && Notification.permission === 'granted') ? ic('check', 12, 3) + ' ' : '') + label + '</button>').join('') + '</div>'
    if (ch === 'desktop') html += desktopPanel()
    else {
      const c = d[ch]
      const lock = nfLock()
      const tested = !!c.testedAt
      const tr = st.nres[ch + '|test']
      const last = tr ? resLine(ch, 'test') : c.lastTest && c.lastTest.at ? '<span class="' + (c.lastTest.ok === false ? 'bd' : 'ok') + ' sm">' + esc(c.lastTest.ok === false ? T('Failed: ') + (c.lastTest.reason || '') : T('Test sent ') + nfTime(c.lastTest.at) + T(', arrived')) + '</span>' : tested ? '<span class="ok sm">' + T('Test sent ') + nfTime(c.testedAt) + '</span>' : '<span class="mut sm">' + T('No test sent yet.') + '</span>'
      html += '<div class="card pad nfc"><form data-evform="nf-save" data-arg="' + ch + '" style="display:flex;flex-direction:column;gap:14px">' + channelForm(ch, c, d) +
        '<div class="rw" style="gap:12px;flex-wrap:wrap"><button type="submit" class="b pri"' + (lock ? ' disabled' : '') + '>' + T('Save') + '</button>' + resLine(ch, 'save') + '</div></form>'
      html += '<div class="nfsep"></div><div class="rw" style="gap:12px;flex-wrap:wrap"><button type="button" class="b" data-ev="nf2" data-arg="test|' + ch + '"' + (lock ? ' disabled' : '') + '>' + T('Send test') + '</button>' + last + '</div>'
      html += '<div class="nfsep"></div><label class="rw" style="margin:0;cursor:pointer"><span class="sp"><b class="hi">' + T('Send alerts to my phone') + '</b><span class="mut sm" style="display:block">' + (tested || c.enabled ? T('On after a test arrived. Turning it off signs out the paired phones of this channel.') : T('Stays off until a test has been sent.')) + '</span></span><input type="checkbox" class="tgl" data-ev-change="nf-on" data-arg="' + ch + '"' + (c.enabled ? ' checked' : '') + (lock || !(tested || c.enabled) ? ' disabled' : '') + '></label>'
      if (ch !== 'pushover') html += '<label class="rw" style="margin:12px 0 0;cursor:pointer"><span class="sp"><b class="hi">' + T(ch === 'ntfy' ? 'Show the question, with Approve and Reject' : 'Show details') + '</b><span class="mut sm" style="display:block">' + (ch === 'ntfy' ? T('The ntfy server you use sees the question text. A server of your own keeps it private.') : T('Telegram sees the question text; bot chats are not end-to-end encrypted.')) + '</span></span><input type="checkbox" class="tgl" data-ev-change="nf-details" data-arg="' + ch + '"' + (c.details ? ' checked' : '') + (lock ? ' disabled' : '') + '></label>'
      // the server leaves the buttons out (notify.cjs, sendNtfy); this only says so
      if (ch === 'ntfy' && c.buttons === false) html += '<p class="note" style="margin-top:10px">' + ic('info', 13) + T('Approve and Reject buttons are not sent: anyone who guesses a typed topic on a public server can read it. Questions still arrive. For buttons, use a generated topic, or set an access token.') + (lock ? '' : ' <button type="button" class="b sm" data-ev="nf2" data-arg="newtopic|ntfy">' + T('Use a generated topic') + '</button>') + '</p>'
      html += '<div class="nfsep"></div>' + eventBoxes(ch, evOf(d, ch)) + '</div>'
    }
    html += '</div><div><div class="sec">' + T('For every phone') + '</div><div class="card pad"><form data-evform="nf-expiry" class="rw" style="gap:10px;flex-wrap:wrap"><label class="rw" style="gap:8px;margin:0;font-size:13px">' + T('A phone request expires after (minutes)') + '<input type="number" name="minutes" min="5" max="1440" step="1" value="' + esc(d.expiryMin) + '" style="width:100px"' + (nfLock() ? ' disabled' : '') + '></label>' + (nfLock() ? '' : '<button type="submit" class="b sm">' + T('Save') + '</button>') + '<span class="sp"></span>' + (nfLock() ? '' : '<button type="button" class="b sm bad' + armedCls('nf|signout') + '" data-ev="nf2" data-arg="signout|">' + esc(armedLabel('nf|signout', T('Sign out all phones'))) + '</button>') + '</form>' +
      '<p class="mut sm" style="margin-top:10px">' + T('The stalled-run limit is in Settings, Decisions. Payments and hires are never approved from a phone. Email is not built yet.') + '</p>' +
      '<p class="mut sm" style="margin-top:6px">' + T('Tokens are saved on this computer and never shown again. An environment variable of the same name wins.') + ' ' + nfFileWord(d) + '</p>' +
      '<p class="mut sm" style="margin-top:6px">' + T('Signing key: ') + (sec(d, 'phoneKey').set ? '<span class="chip ok sm">' + T(sec(d, 'phoneKey').from === 'env' ? 'set by an environment variable' : 'set') + '</span>' : '<span class="chip warn sm">' + T('made on the first save') + '</span>') + ' · ' + T('Your computer must be on, with Arsenale running.') + '</p></div></div>'
    return html + msgHtml()
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ev]')
    if (!t) return
    const a = t.dataset.ev, arg = t.dataset.arg || ''
    if (a !== 'nf2') return
    const [op, ch] = arg.split('|')
    if (op === 'dtest') {
      try {
        new Notification('Arsenale', { body: 'Test: this computer can show alerts.', tag: 'arsenale-test' })
        setRes('desktop', 'test', true, T('Test sent ') + nfTime())
      } catch (err) { setRes('desktop', 'test', false, T('Failed: ') + (err && err.message ? err.message : T('the browser refused'))) }
      return
    }
    if (op === 'signout') { if (!arm('nf|signout')) return; act(() => NF.signout(), (b) => { st.data.notify = b.result; st.dmsg = { ok: true, text: T('Signed out.') } }); return }
    if (op === 'newtopic') {
      act(() => NF.newTopic(), (b) => {
        st.data.notify = b.result
        delete st.nres['ntfy|test']
        // a redraw keeps what is in a field (paint), so the new topic is put there
        const f = document.querySelector('form[data-evform=nf-save] input[name=topic]')
        if (f) f.value = b.result.ntfy.topic
        st.dmsg = { ok: true, text: T('New topic saved. Subscribe to it in the ntfy app, then send a test again.') }
      })
      return
    }
    if (op === 'pair') { act(() => NF.pair(ch), (b) => { st.data.notify = b.result }); return }
    if (op === 'test') {
      setRes(ch, 'test', true, T('Sending…'))
      NF.test(ch).then((b) => { st.data.notify = b.result; setRes(ch, 'test', true, T('Test sent ') + nfTime() + T(', arrived? Check your phone.')) }, (err) => setRes(ch, 'test', false, T('Failed: ') + errTxt(err.message)))
    }
  })
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-ev-change]')
    if (!t) return
    const a = t.dataset.evChange, arg = t.dataset.arg || ''
    if (a === 'auto-master') act(() => send('api/automation', { autoRun: t.checked }), (b) => { st.data.automation = b.result; st.dmsg = { ok: true, text: T('Saved. ') + (b.result.autoRun ? T('Approved merges and phases now run by themselves.') : T('Everything waits for your approval again.')) } })
    else if (a === 'auto-kind') act(() => send('api/automation', { kinds: { [arg]: t.checked } }), (b) => { st.data.automation = b.result; st.dmsg = { ok: true, text: T('Saved.') } })
    else if (a === 'nf-on') act(() => NF.enable(arg, t.checked), (b) => { st.data.notify = b.result })
    else if (a === 'nf-details') act(() => NF.details(arg, t.checked), (b) => { st.data.notify = b.result })
    else if (a === 'nf-event') {
      const [ch, key] = arg.split('|')
      const cur = evOf(NF.state(), ch) || {}
      const next = {}
      for (const [k, , def] of NF_EVENTS) next[k] = typeof cur[k] === 'boolean' ? cur[k] : def
      next[key] = t.checked
      act(() => NF.events(ch, next), (b) => { st.data.notify = b.result })
    }
  })
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-evform]')
    if (!f) return
    const a = f.dataset.evform
    if (a === 'limits') {
      e.preventDefault()
      const body = {}
      for (const k of ['stallMinutes', 'deadMinutes']) body[k] = Number(f.elements[k].value)
      act(() => send('api/limits', body), () => { st.dmsg = { ok: true, text: T('Saved.') }; load('live', 'api/live', true) })
    } else if (a === 'nf-save') {
      e.preventDefault()
      const ch = f.dataset.arg
      const fields = {}
      for (const el of f.elements) if (el.name) { const v = String(el.value || '').trim(); if (v) fields[el.name] = v }
      const bad = nfCheck(ch, fields)
      if (bad) { setRes(ch, 'save', false, T('Not saved: ') + T(bad)); return }
      if (!Object.keys(fields).length) { setRes(ch, 'save', true, T('Nothing to save.')); return }
      const wasTested = !!(((NF.state() || {})[ch] || {}).testedAt)
      NF.save(ch, fields).then((b) => {
        st.data.notify = b.result
        // a new server, topic or token is an untested target: the server cleared the test and turned the channel off
        const again = wasTested && !(b.result[ch] || {}).testedAt
        if (again) delete st.nres[ch + '|test']
        setRes(ch, 'save', true, T('Saved ') + nfTime() + (again ? T('. The target changed: send a test again before you turn it on.') : ''))
      }, (err) => setRes(ch, 'save', false, T('Not saved: ') + errTxt(err.message)))
    } else if (a === 'nf-expiry') {
      e.preventDefault()
      const n = Number(f.elements.minutes.value)
      if (!Number.isInteger(n) || n < 5 || n > 1440) { st.dmsg = { ok: false, text: T('Not saved: the expiry is a whole number of minutes from 5 to 1440') }; bump(); return }
      act(() => NF.expiry(n), (b) => { st.data.notify = b.result; st.dmsg = { ok: true, text: T('Saved.') } })
    }
  })
