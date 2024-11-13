import React from 'react';
import { Html, Button, Hr, Text } from '@react-email/components';

export function Template(props) {
  return (
    <Html lang="en">
      <Text>Some title</Text>
      <Hr />
      <Button href="https://example.com">Click me</Button>
    </Html>
  );
}

export default Template;
