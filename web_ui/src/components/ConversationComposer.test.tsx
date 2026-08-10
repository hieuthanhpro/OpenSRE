import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationComposer from './ConversationComposer';

describe('ConversationComposer message queue', () => {
  it('keeps input enabled while busy', () => {
    render(
      <ConversationComposer
        busy
        onSend={vi.fn()}
        onQueueMessage={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByTestId('conversation-composer-input');
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('placeholder', 'Queue a message…');
  });

  it('shows queued messages with Queued tag', () => {
    render(
      <ConversationComposer
        busy
        queuedMessages={['make it blue not green']}
        onSend={vi.fn()}
        onQueueMessage={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const list = screen.getByTestId('conversation-composer-queued-list');
    expect(list).toHaveTextContent('make it blue not green');
    expect(list).toHaveTextContent('Queued');
    expect(list).not.toHaveTextContent('message queued');
  });

  it('lists each queued message separately', () => {
    render(
      <ConversationComposer
        busy
        queuedMessages={['check Redis', 'ignore payment']}
        onSend={vi.fn()}
        onQueueMessage={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId('conversation-composer-queued-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('check Redis');
    expect(items[1]).toHaveTextContent('ignore payment');
    expect(screen.getAllByText('Queued')).toHaveLength(2);
  });

  it('calls onQueueMessage when submitting while busy', () => {
    const onQueueMessage = vi.fn();
    render(
      <ConversationComposer
        busy
        onSend={vi.fn()}
        onQueueMessage={onQueueMessage}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByTestId('conversation-composer-input');
    fireEvent.change(input, { target: { value: 'check logs next' } });
    fireEvent.click(screen.getByTestId('conversation-composer-send'));

    expect(onQueueMessage).toHaveBeenCalledWith('check logs next');
  });

  it('clears input after successful queue', async () => {
    const onQueueMessage = vi.fn().mockResolvedValue(undefined);
    render(
      <ConversationComposer
        busy
        onSend={vi.fn()}
        onQueueMessage={onQueueMessage}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByTestId('conversation-composer-input');
    fireEvent.change(input, { target: { value: 'check logs next' } });
    fireEvent.click(screen.getByTestId('conversation-composer-send'));

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('keeps input and shows error when queue fails', async () => {
    const onQueueMessage = vi.fn().mockRejectedValue(new Error('Queue failed'));
    render(
      <ConversationComposer
        busy
        onSend={vi.fn()}
        onQueueMessage={onQueueMessage}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByTestId('conversation-composer-input');
    fireEvent.change(input, { target: { value: 'still here' } });
    fireEvent.click(screen.getByTestId('conversation-composer-send'));

    await waitFor(() => {
      expect(screen.getByTestId('conversation-composer-queue-error')).toHaveTextContent(
        'Queue failed',
      );
    });
    expect(input).toHaveValue('still here');
  });

  it('renders attached context chips and formats message on send', () => {
    const onSend = vi.fn();
    render(
      <ConversationComposer
        onSend={onSend}
        initialAttachments={[
          {
            id: '/app/awr/orcl/awrrpt_1_5334_5335.html',
            name: 'awrrpt_1_5334_5335.html',
            path: '/app/awr/orcl/awrrpt_1_5334_5335.html',
            type: 'file',
          },
        ]}
        initialValue="Check SQL queries"
      />,
    );

    const attachmentsContainer = screen.getByTestId('conversation-composer-attachments');
    expect(attachmentsContainer).toHaveTextContent('awrrpt_1_5334_5335.html');

    fireEvent.click(screen.getByTestId('conversation-composer-send'));
    expect(onSend).toHaveBeenCalledWith(
      '[Đính kèm context: `/app/awr/orcl/awrrpt_1_5334_5335.html`]\nCheck SQL queries',
    );
  });

  it('allows removing an attachment chip', () => {
    render(
      <ConversationComposer
        onSend={vi.fn()}
        initialAttachments={[
          {
            id: 'file1',
            name: 'report.html',
            path: '/path/report.html',
            type: 'file',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('conversation-composer-attachments')).toHaveTextContent('report.html');
    const removeBtn = screen.getByTitle('Gỡ đính kèm');
    fireEvent.click(removeBtn);
    expect(screen.queryByTestId('conversation-composer-attachments')).toBeNull();
  });
});

