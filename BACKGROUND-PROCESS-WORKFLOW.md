# Background Process Workflow - Monitor Progress in Real-Time

## Goal
Document how to execute long-running commands (like `dd`, compilation, file transfer) while showing progress to the user in real-time.

## Problem
When running commands via SSH/opencode, the output may not show progress until the command completes, making it seem like the process is stuck.

## Solution: Background Process with Progress Monitoring

### Method 1: `dd` with USR1 Signal (Best for dd)

```bash
# Start dd in background
dd if=/path/to/input of=/path/to/output bs=4M &

# Get PID
DD_PID=$!

# Send USR1 signal every 2 seconds to show progress
while kill -USR1 $DD_PID 2>/dev/null; do
    sleep 2
done

# Wait for completion
wait $DD_PID
sync
```

**Example:**
```bash
ssh user@host "dd if=/opt/file.iso of=/dev/sdb bs=4M & DD_PID=\$!; while kill -USR1 \$DD_PID 2>/dev/null; do sleep 2; done; wait \$DD_PID; sync; echo 'Done'"
```

### Method 2: Use `pv` for Any Command (If Available)

```bash
# Pipe through pv to show progress bar
dd if=/path/to/input | pv -s SIZE | dd of=/path/to/output bs=4M
```

**Example:**
```bash
dd if=file.iso | pv -s 77M | dd of=/dev/sdb bs=4M
```

### Method 3: Simple Output with `tee` (Fallback)

```bash
# Run command and tee output to a file, then tail the file
command 2>&1 | tee /tmp/output.log &
tail -f /tmp/output.log
```

### Method 4: Check Progress via Separate SSH Session

```bash
# Terminal 1: Start long process
ssh user@host "long_running_command"

# Terminal 2: Monitor progress
ssh user@host "ps aux | grep command"
ssh user@host "ls -lh /path/being/written"
```

## Our Workflow (N100 Alpine Router)

### Writing ISO to USB with Progress

```bash
# On N100 (Alpine)
# 1. Check USB device
dmesg | tail -20 | grep -E 'sd[b-z]|USB'

# 2. Write ISO with progress (Alpine dd doesn't support 'status=progress')
dd if=/opt/smart-router-monolith/alpine-router-n100-20260506.iso of=/dev/sdc bs=4M &

# 3. In another session, check progress
watch -n 2 "ls -lh /dev/sdc*; cat /proc/$(pgrep dd)/io 2>/dev/null"

# 4. Or use simple dd and wait (output shows at end)
dd if=/opt/smart-router-monolith/alpine-router-n100-20260506.iso of=/dev/sdc bs=4M
sync
```

### Verification After Write

```bash
# Check first bytes (should NOT be all zeros)
dd if=/dev/sdc bs=2048 count=1 | xxd | head -5

# Compare MD5 (should match)
md5sum /opt/smart-router-monolith/alpine-router-n100-20260506.iso
dd if=/dev/sdc bs=1M count=78 | md5sum

# Check if bootable (look for ISO9660 or boot signature)
dd if=/dev/sdc bs=2048 count=16 | file -
fdisk -l /dev/sdc
```

## Key Lessons Learned

1. **Alpine's `dd` doesn't support `status=progress`** - Use USR1 signal or simple output
2. **Always verify writes** - Check first bytes, MD5, or boot signature
3. **Use `sync` after `dd`** - Ensures data is written to physical device
4. **For opencode/SSH** - Commands may buffer output; use simple commands that output at completion
5. **Show intermediate steps** - Break long commands into steps with verification

## Commands That Show Progress

| Command | Progress Method |
|---------|----------------|
| `dd` | `kill -USR1 <pid>` or simple output at end |
| `cp` | `cp -v` (verbose) |
| `rsync` | `rsync -P` or `rsync --progress` |
| `wget` | `wget --progress=bar` |
| `curl` | `curl --progress-bar` |
| `scp` | `scp -v` (verbose, not real progress) |
| `make` | `make -j4` shows compilation progress |

## Example: Full Workflow Documented

```bash
# Step 1: Check USB
ssh user@host "dmesg | tail -10 | grep sd"

# Step 2: Write ISO (show output)
ssh user@host "dd if=/path/file.iso of=/dev/sdb bs=4M 2>&1; sync; echo 'Write complete'"

# Step 3: Verify (show output)
ssh user@host "dd if=/dev/sdb bs=2048 count=1 | xxd | head -3; md5sum /path/file.iso; dd if=/dev/sdb bs=1M count=78 | md5sum"

# Step 4: Confirm bootable
ssh user@host "dd if=/dev/sdb bs=2048 count=16 | file -"
```

## For Future Sessions

When user asks to "show progress" or "don't stop output":
1. Use simple commands that output at completion
2. Break into steps with verification
3. Use `tee` to log and display
4. Document the workflow in real-time
5. Always verify the result
