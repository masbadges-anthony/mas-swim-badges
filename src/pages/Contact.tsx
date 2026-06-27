import ContactForm from '../components/ContactForm';
import EditableText from '../components/EditableText';
import '../styles/admin.css';

export default function Contact() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow"><EditableText keyName="contact.header.eyebrow">Get in touch</EditableText></p>
        <h1><EditableText keyName="contact.header.title">Contact & enquiries</EditableText></h1>
        <p className="mas-lede">
          <EditableText keyName="contact.header.lede">
            Choose the option that fits, and your enquiry goes straight to the right
            person at Malaysia Aquatics. We reply by email.
          </EditableText>
        </p>
      </header>

      <ContactForm />
    </section>
  );
}
